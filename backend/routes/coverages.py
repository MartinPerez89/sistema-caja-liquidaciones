from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from ..database import get_db
from ..models import ShiftCoverageCreate
from ..rules_engine import log_audit, round_money, sync_all_weekly_liquidations

router = APIRouter(prefix="/api/coverages", tags=["coverages"])

@router.get("/rules")
def list_coverage_rules():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cr.*, 
                   e1.name as absent_employee_name,
                   e2.name as covering_employee_name
            FROM coverage_rules cr
            LEFT JOIN employees e1 ON cr.absent_employee_id = e1.id
            LEFT JOIN employees e2 ON cr.covering_employee_id = e2.id
            WHERE cr.active = 1
        """)
        return [dict(r) for r in cursor.fetchall()]

@router.get("/{week_id}")
def list_week_coverages(week_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sc.*,
                   e1.name as absent_name,
                   e2.name as covering_name
            FROM shift_coverages sc
            JOIN employees e1 ON sc.absent_employee_id = e1.id
            JOIN employees e2 ON sc.covering_employee_id = e2.id
            WHERE sc.week_id = ?
            ORDER BY sc.date DESC
        """, (week_id,))
        return [dict(r) for r in cursor.fetchall()]

@router.post("")
def create_shift_coverage(payload: ShiftCoverageCreate):
    """
    RF-06, RN-07:
    Registra cobertura de turno.
    Aplica regla configurada (ej. Ariel cubre Erica: +$38.500 Ariel, -$42.000 Erica).
    Sincroniza liquidaciones evitando duplicación de descuentos si ya se registró la ausencia.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM weeks WHERE id = ?", (payload.week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")
        if week["status"] == "CLOSED":
            raise HTTPException(status_code=400, detail="No se pueden registrar coberturas en una semana cerrada")

        # Buscar regla predeterminada si no vienen importes
        absent_discount = payload.absent_discount
        covering_addition = payload.covering_addition

        if absent_discount is None or covering_addition is None:
            cursor.execute("""
                SELECT absent_discount, covering_addition
                FROM coverage_rules
                WHERE absent_employee_id = ? AND covering_employee_id = ? AND active = 1
                ORDER BY id DESC LIMIT 1
            """, (payload.absent_employee_id, payload.covering_employee_id))
            rule = cursor.fetchone()
            if rule:
                if absent_discount is None:
                    absent_discount = float(rule["absent_discount"])
                if covering_addition is None:
                    covering_addition = float(rule["covering_addition"])
            else:
                # Si no hay regla específica, tomar valor diario del ausente
                cursor.execute("SELECT weekly_salary, reference_days FROM employees WHERE id = ?", (payload.absent_employee_id,))
                emp_absent = cursor.fetchone()
                daily = round_money(emp_absent["weekly_salary"] / (emp_absent["reference_days"] or 5)) if emp_absent else 0.0
                absent_discount = absent_discount or daily
                covering_addition = covering_addition or daily

        cursor.execute("""
            INSERT INTO shift_coverages (
                week_id, date, absent_employee_id, covering_employee_id,
                shift_name, absent_discount, covering_addition, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.week_id,
            payload.date,
            payload.absent_employee_id,
            payload.covering_employee_id,
            payload.shift_name,
            round_money(absent_discount),
            round_money(covering_addition),
            payload.notes
        ))
        new_id = cursor.lastrowid

        # También verificar si la persona ausente ya tiene registrada la ausencia en attendance;
        # si no la tiene registrada, registrarla para consistencia en la grilla sin duplicar importe
        cursor.execute("""
            INSERT OR IGNORE INTO attendance (week_id, employee_id, date, status, discount_amount, notes)
            VALUES (?, ?, ?, 'AUSENCIA', ?, 'Cubierto por compañero')
        """, (payload.week_id, payload.absent_employee_id, payload.date, round_money(absent_discount)))

        log_audit(
            conn, payload.user, "CREATE_SHIFT_COVERAGE", "shift_coverages", str(new_id),
            None, payload.dict(), f"Cobertura de turno: ausente {payload.absent_employee_id}, cubre {payload.covering_employee_id}"
        )

        sync_all_weekly_liquidations(conn, payload.week_id)

        return {"id": new_id, "message": "Cobertura registrada y liquidaciones actualizadas"}

@router.delete("/{coverage_id}")
def delete_shift_coverage(coverage_id: int, user: str = "Administrador", reason: str = "Eliminación de cobertura"):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM shift_coverages WHERE id = ?", (coverage_id,))
        cov = cursor.fetchone()
        if not cov:
            raise HTTPException(status_code=404, detail="Cobertura no encontrada")

        week_id = cov["week_id"]
        old_data = dict(cov)

        cursor.execute("DELETE FROM shift_coverages WHERE id = ?", (coverage_id,))

        log_audit(
            conn, user, "DELETE_SHIFT_COVERAGE", "shift_coverages", str(coverage_id),
            old_data, None, reason
        )

        sync_all_weekly_liquidations(conn, week_id)

        return {"message": "Cobertura eliminada y liquidaciones recalculadas"}
