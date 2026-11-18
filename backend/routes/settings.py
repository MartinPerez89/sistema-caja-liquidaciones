from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from ..database import get_db
from ..models import SettingUpdate
from ..rules_engine import log_audit

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("")
def get_all_settings():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM settings ORDER BY key")
        return [dict(r) for r in cursor.fetchall()]

@router.put("")
def update_setting(payload: SettingUpdate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM settings WHERE key = ?", (payload.key,))
        old = cursor.fetchone()
        if not old:
            raise HTTPException(status_code=404, detail="Configuración no encontrada")

        cursor.execute("""
            UPDATE settings
            SET value = ?, updated_at = CURRENT_TIMESTAMP
            WHERE key = ?
        """, (payload.value, payload.key))

        log_audit(
            conn, payload.user, "UPDATE_SETTING", "settings", payload.key,
            {"value": old["value"]}, {"value": payload.value}, payload.reason
        )

        return {"message": f"Configuración {payload.key} actualizada correctamente"}
