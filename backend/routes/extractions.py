from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from ..database import get_db
from ..models import CashExtractionCreate
from ..rules_engine import log_audit, round_money, calculate_week_cash_balance

router = APIRouter(prefix="/api/extractions", tags=["extractions"])

@router.get("/{week_id}")
def list_extractions(week_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT ce.*, m.amount as movement_amount
            FROM cash_extractions ce
            JOIN movements m ON ce.movement_id = m.id
            WHERE ce.week_id = ?
            ORDER BY ce.date DESC, ce.id DESC
        """, (week_id,))
        return [dict(r) for r in cursor.fetchall()]

@router.post("")
def create_extraction(payload: CashExtractionCreate):
    """
    RF-10:
    Registra extracción parcial o total.
    Reduce el efectivo en caja mediante un movimiento de EGRESO.
    Si es TOTAL, el importe se ajusta exactamente al saldo disponible restante
    para que la caja quede en cero ($0.00).
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM weeks WHERE id = ?", (payload.week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")
        if week["status"] == "CLOSED":
            raise HTTPException(status_code=400, detail="No se pueden registrar extracciones en una semana cerrada")

        cash_info = calculate_week_cash_balance(conn, payload.week_id)
        current_cash = cash_info["current_cash"]

        if payload.extraction_type == "TOTAL":
            if current_cash <= 0:
                raise HTTPException(status_code=400, detail="No hay saldo positivo disponible en caja para realizar una extracción total")
            extraction_amount = current_cash
            concept_str = f"Extracción total de caja - Destino: {payload.destination}"
        else:
            if payload.amount <= 0:
                raise HTTPException(status_code=400, detail="El importe de la extracción parcial debe ser mayor a cero")
            if payload.amount > current_cash:
                raise HTTPException(status_code=400, detail=f"Importe solicitado (${payload.amount:,.2f}) supera el saldo actual en caja (${current_cash:,.2f})")
            extraction_amount = round_money(payload.amount)
            concept_str = f"Extracción parcial de caja - Destino: {payload.destination}"

        # 1. Registrar egreso en caja
        cursor.execute("""
            INSERT INTO movements (
                week_id, date, type, amount, concept, category, fund_source, notes
            ) VALUES (?, ?, 'EGRESO', ?, ?, 'Extracción', 'CAJA', ?)
        """, (payload.week_id, payload.date, extraction_amount, concept_str, payload.notes))
        movement_id = cursor.lastrowid

        # 2. Registrar en tabla de extracciones
        cursor.execute("""
            INSERT INTO cash_extractions (
                week_id, date, extraction_type, amount, destination, notes, movement_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.week_id,
            payload.date,
            payload.extraction_type,
            extraction_amount,
            payload.destination,
            payload.notes,
            movement_id
        ))
        extraction_id = cursor.lastrowid

        log_audit(
            conn, payload.user, "CREATE_EXTRACTION", "cash_extractions", str(extraction_id),
            None, payload.dict(), f"Extracción {payload.extraction_type}: ${extraction_amount} hacia {payload.destination}"
        )

        new_cash_info = calculate_week_cash_balance(conn, payload.week_id)

        return {
            "id": extraction_id,
            "movement_id": movement_id,
            "extraction_type": payload.extraction_type,
            "amount": extraction_amount,
            "remaining_cash": new_cash_info["current_cash"],
            "message": f"Extracción {payload.extraction_type.lower()} registrada exitosamente"
        }
