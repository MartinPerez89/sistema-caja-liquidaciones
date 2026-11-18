from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
import datetime
from ..database import get_db
from ..models import AttendanceBatchUpdate
from ..rules_engine import log_audit, round_money, get_employee_daily_value, sync_all_weekly_liquidations

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

@router.get("/{week_id}")
def get_week_attendance(week_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM weeks WHERE id = ?", (week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")

        start = datetime.date.fromisoformat(week["start_date"])
        # Monday to Friday
        week_days = [(start + datetime.timedelta(days=i)).isoformat() for i in range(5)]

        cursor.execute("SELECT id, name, weekly_salary, reference_days FROM employees WHERE active = 1 ORDER BY id ASC")
        employees = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM attendance WHERE week_id = ?", (week_id,))
        att_rows = cursor.fetchall()
        att_map = {(r["employee_id"], r["date"]): dict(r) for r in att_rows}

        grid = []
        for emp in employees:
            daily_val = round_money(emp["weekly_salary"] / (emp["reference_days"] or 5))
            emp_days = []
            total_discount = 0.0
            absent_days = 0

            for d in week_days:
                att = att_map.get((emp["id"], d))
                if att:
                    status = att["status"]
                    discount = float(att["discount_amount"])
                    notes = att["notes"] or ""
                else:
                    status = 'TRABAJADO' # Default
                    discount = 0.0
                    notes = ""

                if status in ['AUSENCIA', 'FERIADO_NO_TRABAJADO', 'LICENCIA', 'OTRO_NO_TRABAJADO']:
                    total_discount += discount if discount > 0 else daily_val
                    absent_days += 1

                emp_days.append({
                    "date": d,
                    "status": status,
                    "discount_amount": discount if status != 'TRABAJADO' else 0.0,
                    "notes": notes
                })

            grid.append({
                "employee_id": emp["id"],
                "employee_name": emp["name"],
                "daily_value": daily_val,
                "days": emp_days,
                "total_discount": round_money(total_discount),
                "absent_days": absent_days
            })

        return {
            "week_id": week_id,
            "week_days": week_days,
            "grid": grid
        }

@router.post("/batch")
def update_week_attendance(payload: AttendanceBatchUpdate):
    """
    RF-04, RN-05:
    Actualiza asistencia por empleado y fecha (Lunes a Viernes).
    Impide duplicaciones mediante restricción UNIQUE(employee_id, date).
    Calcula el descuento diario individualmente.
    Sincroniza automáticamente la liquidación semanal.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM weeks WHERE id = ?", (payload.week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")
        if week["status"] == "CLOSED":
            raise HTTPException(status_code=400, detail="No se puede modificar asistencia de una semana cerrada")

        unworked_statuses = ['AUSENCIA', 'FERIADO_NO_TRABAJADO', 'LICENCIA', 'OTRO_NO_TRABAJADO']

        for item in payload.items:
            daily_val = get_employee_daily_value(conn, item.employee_id)
            if item.status in unworked_statuses:
                discount = item.discount_amount if (item.discount_amount is not None and item.discount_amount > 0) else daily_val
            else:
                discount = 0.0

            cursor.execute("""
                INSERT INTO attendance (week_id, employee_id, date, status, discount_amount, notes, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(employee_id, date) DO UPDATE SET
                    status = excluded.status,
                    discount_amount = excluded.discount_amount,
                    notes = excluded.notes,
                    updated_at = CURRENT_TIMESTAMP
            """, (payload.week_id, item.employee_id, item.date, item.status, round_money(discount), item.notes))

        # Registrar en auditoría
        log_audit(
            conn, payload.user, "UPDATE_ATTENDANCE_BATCH", "attendance", str(payload.week_id),
            None, {"count": len(payload.items)}, "Actualización de grilla de asistencia semanal"
        )

        # Sincronizar liquidaciones para que impacten los descuentos
        sync_all_weekly_liquidations(conn, payload.week_id)

        return {"message": "Asistencia actualizada y liquidaciones recalculadas con éxito"}
