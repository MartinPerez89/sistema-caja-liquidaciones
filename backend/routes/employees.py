from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
import datetime
from ..database import get_db
from ..models import EmployeeCreate, EmployeeUpdate
from ..rules_engine import log_audit, round_money, sync_all_weekly_liquidations

router = APIRouter(prefix="/api/employees", tags=["employees"])

@router.get("")
def list_employees(active_only: bool = False):
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM employees"
        if active_only:
            query += " WHERE active = 1"
        query += " ORDER BY id ASC"
        cursor.execute(query)
        rows = cursor.fetchall()
        
        result = []
        for r in rows:
            emp = dict(r)
            ref_days = emp["reference_days"] or 5
            emp["daily_value"] = round_money(emp["weekly_salary"] / ref_days)
            result.append(emp)
        return result

@router.get("/{employee_id}/history")
def get_employee_salary_history(employee_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sh.*, e.name as employee_name
            FROM salary_history sh
            JOIN employees e ON sh.employee_id = e.id
            WHERE sh.employee_id = ?
            ORDER BY sh.effective_from DESC, sh.created_at DESC
        """, (employee_id,))
        return [dict(r) for r in cursor.fetchall()]

@router.post("")
def create_employee(payload: EmployeeCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO employees (name, weekly_salary, reference_days, habitual_shift, active)
                VALUES (?, ?, ?, ?, 1)
            """, (payload.name.strip(), round_money(payload.weekly_salary), payload.reference_days, payload.habitual_shift))
            new_id = cursor.lastrowid

            today = datetime.date.today().isoformat()
            cursor.execute("""
                INSERT INTO salary_history (employee_id, weekly_salary, reference_days, effective_from, reason)
                VALUES (?, ?, ?, ?, 'Alta inicial de empleado')
            """, (new_id, round_money(payload.weekly_salary), payload.reference_days, today))

            log_audit(
                conn, payload.user, "CREATE_EMPLOYEE", "employees", str(new_id),
                None, payload.dict(), f"Alta de empleado {payload.name}"
            )
            return {"id": new_id, "message": "Empleado creado exitosamente"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error creando empleado: {str(e)}")

@router.put("/{employee_id}")
def update_employee(employee_id: int, payload: EmployeeUpdate):
    """
    RF-03: Conservar historial de cambios en sueldos y condiciones con fecha de vigencia.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM employees WHERE id = ?", (employee_id,))
        old_emp = cursor.fetchone()
        if not old_emp:
            raise HTTPException(status_code=404, detail="Empleado no encontrado")

        old_data = dict(old_emp)
        salary_changed = (old_emp["weekly_salary"] != payload.weekly_salary) or (old_emp["reference_days"] != payload.reference_days)

        cursor.execute("""
            UPDATE employees
            SET name = ?,
                weekly_salary = ?,
                reference_days = ?,
                habitual_shift = ?,
                active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            payload.name.strip(),
            round_money(payload.weekly_salary),
            payload.reference_days,
            payload.habitual_shift,
            payload.active,
            employee_id
        ))

        effective_date = payload.effective_from or datetime.date.today().isoformat()

        if salary_changed:
            cursor.execute("""
                INSERT INTO salary_history (employee_id, weekly_salary, reference_days, effective_from, reason)
                VALUES (?, ?, ?, ?, ?)
            """, (
                employee_id,
                round_money(payload.weekly_salary),
                payload.reference_days,
                effective_date,
                payload.reason or "Modificación de sueldo / días de referencia"
            ))

        log_audit(
            conn, payload.user, "UPDATE_EMPLOYEE", "employees", str(employee_id),
            old_data, payload.dict(), payload.reason
        )

        # Sincronizar semana activa si existe
        cursor.execute("SELECT id FROM weeks WHERE status = 'OPEN'")
        open_weeks = cursor.fetchall()
        for w in open_weeks:
            sync_all_weekly_liquidations(conn, w["id"])

        return {"message": "Empleado y condiciones actualizados con registro histórico"}
