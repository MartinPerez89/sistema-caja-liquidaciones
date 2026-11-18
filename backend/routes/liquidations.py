from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from ..database import get_db
from ..rules_engine import calculate_employee_weekly_liquidation, sync_all_weekly_liquidations, log_audit, round_money

router = APIRouter(prefix="/api/liquidations", tags=["liquidations"])

@router.get("/{week_id}")
def get_week_liquidations(week_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM weeks WHERE id = ?", (week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")

        # Asegurar cálculo actualizado
        sync_all_weekly_liquidations(conn, week_id)

        cursor.execute("SELECT id, name FROM employees WHERE active = 1 ORDER BY id ASC")
        employees = cursor.fetchall()

        liquidations = []
        total_net = 0.0
        total_paid = 0.0
        total_remaining = 0.0

        ariel_info = None
        erica_info = None

        for emp in employees:
            calc = calculate_employee_weekly_liquidation(conn, week_id, emp["id"])
            
            # Obtener datos de la tabla liquidations (id de registro y status confirmado)
            cursor.execute("SELECT id, status, confirmed_at, confirmed_by FROM liquidations WHERE week_id = ? AND employee_id = ?", (week_id, emp["id"]))
            liq_record = cursor.fetchone()
            if liq_record:
                calc["liquidation_id"] = liq_record["id"]
                calc["status"] = liq_record["status"]
                calc["confirmed_at"] = liq_record["confirmed_at"]
                calc["confirmed_by"] = liq_record["confirmed_by"]

            liquidations.append(calc)
            total_net += calc["net_to_pay"]
            total_paid += calc["paid_amount"]
            total_remaining += calc["remaining_debt"]

            if emp["name"].strip().lower() == "ariel":
                ariel_info = calc
            elif emp["name"].strip().lower() == "erica":
                erica_info = calc

        # Línea conjunta para Ariel y Erica (RF-07)
        joint_line = None
        if ariel_info and erica_info:
            joint_line = {
                "ariel_net": ariel_info["net_to_pay"],
                "ariel_paid": ariel_info["paid_amount"],
                "ariel_remaining": ariel_info["remaining_debt"],
                "erica_net": erica_info["net_to_pay"],
                "erica_paid": erica_info["paid_amount"],
                "erica_remaining": erica_info["remaining_debt"],
                "combined_net": round_money(ariel_info["net_to_pay"] + erica_info["net_to_pay"]),
                "combined_paid": round_money(ariel_info["paid_amount"] + erica_info["paid_amount"]),
                "combined_remaining": round_money(ariel_info["remaining_debt"] + erica_info["remaining_debt"]),
                "summary_text": f"Ariel: ${ariel_info['net_to_pay']:,.2f} (Pagado: ${ariel_info['paid_amount']:,.2f}, Pendiente: ${ariel_info['remaining_debt']:,.2f}) | Erica: ${erica_info['net_to_pay']:,.2f} (Pagado: ${erica_info['paid_amount']:,.2f}, Pendiente: ${erica_info['remaining_debt']:,.2f}) | Total: ${round_money(ariel_info['net_to_pay'] + erica_info['net_to_pay']):,.2f}"
            }

        return {
            "week_id": week_id,
            "liquidations": liquidations,
            "joint_line": joint_line,
            "total_net_to_pay": round_money(total_net),
            "total_paid": round_money(total_paid),
            "total_remaining_debt": round_money(total_remaining)
        }

@router.post("/{liquidation_id}/confirm")
def confirm_liquidation(liquidation_id: int, user: str = "Operador"):
    """
    RF-07: Revisar y confirmar la liquidación antes de registrar pagos.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM liquidations WHERE id = ?", (liquidation_id,))
        liq = cursor.fetchone()
        if not liq:
            raise HTTPException(status_code=404, detail="Liquidación no encontrada")

        cursor.execute("""
            UPDATE liquidations
            SET status = 'CONFIRMADA',
                confirmed_at = CURRENT_TIMESTAMP,
                confirmed_by = ?
            WHERE id = ?
        """, (user, liquidation_id))

        log_audit(
            conn, user, "CONFIRM_LIQUIDATION", "liquidations", str(liquidation_id),
            {"status": liq["status"]}, {"status": "CONFIRMADA"}, "Confirmación de liquidación semanal"
        )

        return {"message": "Liquidación confirmada exitosamente"}
