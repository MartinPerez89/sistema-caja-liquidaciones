from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
import datetime
from ..database import get_db
from ..models import WeekCreate, WeekClose, WeekReopen
from ..rules_engine import calculate_week_cash_balance, sync_all_weekly_liquidations, log_audit, round_money

router = APIRouter(prefix="/api/weeks", tags=["weeks"])

@router.get("")
def list_weeks():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT w.*, 
                   (SELECT COUNT(*) FROM movements m WHERE m.week_id = w.id AND m.is_cancelled = 0) as movements_count,
                   (SELECT COUNT(*) FROM liquidations l WHERE l.week_id = w.id) as liquidations_count
            FROM weeks w
            ORDER BY w.start_date DESC
        """)
        weeks = [dict(row) for row in cursor.fetchall()]
        return weeks

@router.get("/current")
def get_current_week():
    with get_db() as conn:
        cursor = conn.cursor()
        # Find active open week, or the latest week
        cursor.execute("""
            SELECT * FROM weeks 
            WHERE status = 'OPEN' 
            ORDER BY start_date DESC 
            LIMIT 1
        """)
        row = cursor.fetchone()
        if not row:
            cursor.execute("SELECT * FROM weeks ORDER BY start_date DESC LIMIT 1")
            row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No se encontró ninguna semana configurada")
        
        week_data = dict(row)
        # Sincronizar liquidaciones y obtener balance
        sync_all_weekly_liquidations(conn, week_data["id"])
        balance = calculate_week_cash_balance(conn, week_data["id"])
        week_data["balance"] = balance
        return week_data

@router.get("/{week_id}")
def get_week_by_id(week_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM weeks WHERE id = ?", (week_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Semana con ID {week_id} no encontrada")
        week_data = dict(row)
        sync_all_weekly_liquidations(conn, week_id)
        balance = calculate_week_cash_balance(conn, week_id)
        week_data["balance"] = balance
        return week_data

@router.post("")
def create_week(payload: WeekCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO weeks (week_code, start_date, end_date, initial_cash, status, notes)
                VALUES (?, ?, ?, ?, 'OPEN', ?)
            """, (payload.week_code, payload.start_date, payload.end_date, payload.initial_cash, payload.notes))
            new_id = cursor.lastrowid
            log_audit(conn, payload.user, "CREATE_WEEK", "weeks", str(new_id), None, payload.dict(), "Creación de nueva semana operativa")
            sync_all_weekly_liquidations(conn, new_id)
            return {"id": new_id, "message": "Semana creada exitosamente"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error creando semana: {str(e)}")

@router.post("/{week_id}/close")
def close_week(week_id: int, payload: WeekClose):
    """
    RN-03, RF-10:
    Cierra la semana calculando el saldo final.
    Crea automáticamente la siguiente semana operativa (Lunes a Viernes),
    trasladando el saldo final como saldo inicial (o 0 si hubo extracción total).
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM weeks WHERE id = ?", (week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")
        if week["status"] == "CLOSED":
            raise HTTPException(status_code=400, detail="La semana ya se encuentra cerrada")
        
        # Sincronizar liquidaciones y calcular saldo final
        sync_all_weekly_liquidations(conn, week_id)
        balance = calculate_week_cash_balance(conn, week_id)
        final_cash = balance["current_cash"]

        # Verificar si hubo extracción total registrada
        cursor.execute("""
            SELECT id FROM cash_extractions 
            WHERE week_id = ? AND extraction_type = 'TOTAL'
        """, (week_id,))
        has_total_extraction = cursor.fetchone() is not None

        next_initial_cash = 0.0 if has_total_extraction or final_cash <= 0 else final_cash

        # Actualizar semana actual
        cursor.execute("""
            UPDATE weeks 
            SET status = 'CLOSED',
                final_cash = ?,
                closed_at = CURRENT_TIMESTAMP,
                closed_by = ?,
                notes = COALESCE(notes || ' | ', '') || ?
            WHERE id = ?
        """, (final_cash, payload.user, payload.notes or "Cierre semanal", week_id))

        log_audit(
            conn, payload.user, "CLOSE_WEEK", "weeks", str(week_id),
            {"status": "OPEN"}, {"status": "CLOSED", "final_cash": final_cash},
            f"Cierre semanal con saldo final: {final_cash}"
        )

        # Proponer y crear automáticamente la siguiente semana si no existe
        curr_start = datetime.date.fromisoformat(week["start_date"])
        next_monday = curr_start + datetime.timedelta(days=7)
        next_friday = next_monday + datetime.timedelta(days=4)
        iso_year, iso_week, _ = next_monday.isocalendar()
        next_week_code = f"{iso_year}-W{iso_week:02d}"

        cursor.execute("SELECT id FROM weeks WHERE week_code = ?", (next_week_code,))
        existing_next = cursor.fetchone()
        if not existing_next:
            cursor.execute("""
                INSERT INTO weeks (week_code, start_date, end_date, initial_cash, status, notes)
                VALUES (?, ?, ?, ?, 'OPEN', 'Apertura automática por cierre de semana anterior')
            """, (next_week_code, next_monday.isoformat(), next_friday.isoformat(), next_initial_cash))
            next_id = cursor.lastrowid
            sync_all_weekly_liquidations(conn, next_id)
            log_audit(conn, "SISTEMA", "AUTO_CREATE_NEXT_WEEK", "weeks", str(next_id), None,
                      {"week_code": next_week_code, "initial_cash": next_initial_cash},
                      "Traslado de saldo inicial según RN-03")

        return {
            "message": "Semana cerrada correctamente",
            "final_cash": final_cash,
            "next_week_code": next_week_code,
            "next_initial_cash": next_initial_cash
        }

@router.post("/{week_id}/reopen")
def reopen_week(week_id: int, payload: WeekReopen):
    """
    RF-10, RF-11: Reapertura de semana con autorización y auditoría estricta.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM weeks WHERE id = ?", (week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")
        if week["status"] == "OPEN":
            raise HTTPException(status_code=400, detail="La semana ya está abierta")

        cursor.execute("""
            UPDATE weeks 
            SET status = 'OPEN',
                reopened_at = CURRENT_TIMESTAMP,
                reopened_by = ?,
                reopened_reason = ?
            WHERE id = ?
        """, (payload.user, payload.reason, week_id))

        log_audit(
            conn, payload.user, "REOPEN_WEEK", "weeks", str(week_id),
            {"status": "CLOSED", "final_cash": week["final_cash"]},
            {"status": "OPEN", "reason": payload.reason},
            f"Reapertura autorizada: {payload.reason}"
        )

        return {"message": "Semana reabierta con éxito y registrada en auditoría"}
