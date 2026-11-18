from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from ..database import get_db
from ..models import SalaryPaymentCreate, PaymentCancel
from ..rules_engine import log_audit, round_money, sync_all_weekly_liquidations, calculate_week_cash_balance

router = APIRouter(prefix="/api/payments", tags=["payments"])

@router.get("")
def list_payments(week_id: Optional[int] = None, employee_id: Optional[int] = None):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT sp.*, 
                   e.name as employee_name,
                   w.week_code,
                   l.net_to_pay,
                   l.remaining_debt
            FROM salary_payments sp
            JOIN employees e ON sp.employee_id = e.id
            JOIN weeks w ON sp.week_id = w.id
            JOIN liquidations l ON sp.liquidation_id = l.id
            WHERE 1=1
        """
        params = []
        if week_id:
            query += " AND sp.week_id = ?"
            params.append(week_id)
        if employee_id:
            query += " AND sp.employee_id = ?"
            params.append(employee_id)

        query += " ORDER BY sp.date DESC, sp.id DESC"
        cursor.execute(query, params)
        return [dict(r) for r in cursor.fetchall()]

@router.post("")
def create_salary_payment(payload: SalaryPaymentCreate):
    """
    RF-08, RN-08:
    Registra pago total o parcial.
    Si origen es CAJA -> Genera egreso de caja (afecta saldo).
    Si origen es FONDOS_EXTERNOS -> NO genera egreso de caja (NO modifica saldo).
    Ambos reducen la deuda de la liquidación del empleado.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT l.*, e.name as employee_name, w.status as week_status
            FROM liquidations l
            JOIN employees e ON l.employee_id = e.id
            JOIN weeks w ON l.week_id = w.id
            WHERE l.id = ?
        """, (payload.liquidation_id,))
        liq = cursor.fetchone()
        if not liq:
            raise HTTPException(status_code=404, detail="Liquidación no encontrada")
        if liq["week_status"] == "CLOSED":
            raise HTTPException(status_code=400, detail="No se pueden registrar pagos en una semana cerrada")

        emp_id = liq["employee_id"]
        emp_name = liq["employee_name"]
        week_id = liq["week_id"]
        amount = round_money(payload.amount)

        # Advertencia de saldo insuficiente si es por caja
        cash_warning = None
        if payload.fund_source == "CAJA":
            cash_info = calculate_week_cash_balance(conn, week_id)
            if cash_info["current_cash"] < amount:
                cash_warning = f"Atención: El saldo en caja (${cash_info['current_cash']:,.2f}) es inferior al importe a pagar (${amount:,.2f})."

        movement_id = None
        if payload.fund_source == "CAJA":
            # Registrar egreso en movimientos de caja
            cursor.execute("""
                INSERT INTO movements (
                    week_id, date, type, amount, concept, category, 
                    fund_source, related_entity_type, related_entity_id, notes
                ) VALUES (?, ?, 'EGRESO', ?, ?, 'Pago semanal', 'CAJA', 'EMPLEADO', ?, ?)
            """, (
                week_id,
                payload.date,
                amount,
                f"Pago de sueldo - {emp_name}",
                emp_id,
                payload.notes or "Pago salarial desde caja"
            ))
            movement_id = cursor.lastrowid

        # Registrar pago en salary_payments
        cursor.execute("""
            INSERT INTO salary_payments (
                liquidation_id, week_id, employee_id, date, amount, fund_source, movement_id, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.liquidation_id,
            week_id,
            emp_id,
            payload.date,
            amount,
            payload.fund_source,
            movement_id,
            payload.notes
        ))
        payment_id = cursor.lastrowid

        # Auditoría
        log_audit(
            conn, payload.user, "CREATE_SALARY_PAYMENT", "salary_payments", str(payment_id),
            None, payload.dict(),
            f"Pago a {emp_name}: ${amount} mediante {payload.fund_source}" + (f" (Egreso Mov #{movement_id})" if movement_id else " (Fondos externos)")
        )

        # Sincronizar estado de liquidación
        sync_all_weekly_liquidations(conn, week_id)

        return {
            "id": payment_id,
            "movement_id": movement_id,
            "message": "Pago registrado con éxito",
            "warning": cash_warning
        }

@router.post("/{payment_id}/cancel")
def cancel_salary_payment(payment_id: int, payload: PaymentCancel):
    """
    RN-10: Anulación de pago conservando auditoría.
    Si tenía movimiento de caja asociado, se anula también el movimiento para restituir el saldo.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM salary_payments WHERE id = ?", (payment_id,))
        payment = cursor.fetchone()
        if not payment:
            raise HTTPException(status_code=404, detail="Pago no encontrado")
        if payment["is_cancelled"] == 1:
            raise HTTPException(status_code=400, detail="El pago ya se encuentra anulado")

        old_data = dict(payment)

        # Anular pago
        cursor.execute("""
            UPDATE salary_payments 
            SET is_cancelled = 1,
                cancelled_reason = ?
            WHERE id = ?
        """, (payload.reason, payment_id))

        # Si generó movimiento en caja, anularlo también
        if payment["movement_id"]:
            cursor.execute("""
                UPDATE movements
                SET is_cancelled = 1,
                    cancelled_reason = ?,
                    cancelled_at = CURRENT_TIMESTAMP,
                    cancelled_by = ?
                WHERE id = ?
            """, (f"Anulación de pago #{payment_id}: {payload.reason}", payload.user, payment["movement_id"]))

        log_audit(
            conn, payload.user, "CANCEL_SALARY_PAYMENT", "salary_payments", str(payment_id),
            old_data, {"is_cancelled": 1, "reason": payload.reason}, payload.reason
        )

        sync_all_weekly_liquidations(conn, payment["week_id"])

        return {"message": "Pago anulado correctamente conservando trazabilidad"}
