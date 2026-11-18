from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from ..database import get_db
from ..models import MovementCreate, MovementUpdate, MovementCancel
from ..rules_engine import log_audit, sync_all_weekly_liquidations, round_money

router = APIRouter(prefix="/api/movements", tags=["movements"])

@router.get("")
def list_movements(
    week_id: Optional[int] = None,
    date: Optional[str] = None,
    type: Optional[str] = None,
    category: Optional[str] = None,
    fund_source: Optional[str] = None,
    include_cancelled: bool = True
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT m.*, 
                   e.name as employee_name
            FROM movements m
            LEFT JOIN employees e ON m.related_entity_type = 'EMPLEADO' AND m.related_entity_id = e.id
            WHERE 1=1
        """
        params = []
        if week_id is not None:
            query += " AND m.week_id = ?"
            params.append(week_id)
        if date:
            query += " AND m.date = ?"
            params.append(date)
        if type:
            query += " AND m.type = ?"
            params.append(type)
        if category:
            query += " AND m.category = ?"
            params.append(category)
        if fund_source:
            query += " AND m.fund_source = ?"
            params.append(fund_source)
        if not include_cancelled:
            query += " AND m.is_cancelled = 0"

        query += " ORDER BY m.date DESC, m.id DESC"
        cursor.execute(query, params)
        movements = [dict(row) for row in cursor.fetchall()]
        return movements

@router.get("/categories")
def list_categories():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM categories ORDER BY type, name")
        return [dict(row) for row in cursor.fetchall()]

@router.post("/check-duplicate")
def check_duplicate(payload: MovementCreate):
    """
    RF-01: Advertir sobre posibles duplicaciones cuando coincidan fecha, importe, concepto y beneficiario.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, date, amount, concept, category, fund_source, is_cancelled
            FROM movements
            WHERE week_id = ?
              AND date = ?
              AND amount = ?
              AND is_cancelled = 0
              AND (
                concept LIKE ? 
                OR (related_entity_type = ? AND related_entity_id = ?)
              )
        """, (
            payload.week_id,
            payload.date,
            payload.amount,
            f"%{payload.concept}%",
            payload.related_entity_type or "",
            payload.related_entity_id or 0
        ))
        matches = [dict(r) for r in cursor.fetchall()]
        return {
            "has_potential_duplicate": len(matches) > 0,
            "count": len(matches),
            "duplicates": matches
        }

@router.post("")
def create_movement(payload: MovementCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verificar estado de la semana
        cursor.execute("SELECT status FROM weeks WHERE id = ?", (payload.week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")
        if week["status"] == "CLOSED":
            raise HTTPException(status_code=400, detail="No se pueden registrar movimientos en una semana cerrada")

        # Inserción
        cursor.execute("""
            INSERT INTO movements (
                week_id, date, type, amount, concept, category, 
                fund_source, related_entity_type, related_entity_id, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.week_id,
            payload.date,
            payload.type,
            round_money(payload.amount),
            payload.concept.strip(),
            payload.category,
            payload.fund_source,
            payload.related_entity_type,
            payload.related_entity_id,
            payload.notes
        ))
        new_id = cursor.lastrowid

        # Auditoría
        log_audit(
            conn, payload.user, "CREATE_MOVEMENT", "movements", str(new_id),
            None, payload.dict(), f"Alta de movimiento {payload.type}: ${payload.amount} ({payload.category})"
        )

        # Si es un adelanto o pago a empleado, sincronizar liquidaciones
        if payload.category in ['Adelanto', 'Pago semanal', 'Pago del día'] or payload.related_entity_type == 'EMPLEADO':
            sync_all_weekly_liquidations(conn, payload.week_id)

        return {"id": new_id, "message": "Movimiento registrado con éxito"}

@router.put("/{movement_id}")
def update_movement(movement_id: int, payload: MovementUpdate):
    """
    RF-01, RN-10: Modificación conservando registro previo en auditoría y motivo obligatorio.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM movements WHERE id = ?", (movement_id,))
        old_row = cursor.fetchone()
        if not old_row:
            raise HTTPException(status_code=404, detail="Movimiento no encontrado")
        if old_row["is_cancelled"] == 1:
            raise HTTPException(status_code=400, detail="No se puede modificar un movimiento que ya fue anulado")

        old_data = dict(old_row)

        cursor.execute("""
            UPDATE movements
            SET amount = ?,
                concept = ?,
                category = ?,
                fund_source = ?,
                related_entity_type = ?,
                related_entity_id = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            round_money(payload.amount),
            payload.concept.strip(),
            payload.category,
            payload.fund_source,
            payload.related_entity_type,
            payload.related_entity_id,
            payload.notes,
            movement_id
        ))

        # Registrar trazabilidad en auditoría
        log_audit(
            conn, payload.user, "UPDATE_MOVEMENT", "movements", str(movement_id),
            old_data, payload.dict(), payload.reason
        )

        sync_all_weekly_liquidations(conn, old_data["week_id"])

        return {"message": "Movimiento modificado correctamente y registrado en auditoría"}

@router.post("/{movement_id}/cancel")
def cancel_movement(movement_id: int, payload: MovementCancel):
    """
    RF-01, RN-10: Anulación sin borrado físico, conservando trazabilidad.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM movements WHERE id = ?", (movement_id,))
        old_row = cursor.fetchone()
        if not old_row:
            raise HTTPException(status_code=404, detail="Movimiento no encontrado")
        if old_row["is_cancelled"] == 1:
            raise HTTPException(status_code=400, detail="El movimiento ya se encuentra anulado")

        old_data = dict(old_row)

        cursor.execute("""
            UPDATE movements
            SET is_cancelled = 1,
                cancelled_reason = ?,
                cancelled_at = CURRENT_TIMESTAMP,
                cancelled_by = ?
            WHERE id = ?
        """, (payload.reason, payload.user, movement_id))

        log_audit(
            conn, payload.user, "CANCEL_MOVEMENT", "movements", str(movement_id),
            old_data, {"is_cancelled": 1, "cancelled_reason": payload.reason}, payload.reason
        )

        sync_all_weekly_liquidations(conn, old_data["week_id"])

        return {"message": "Movimiento anulado correctamente conservando trazabilidad"}
