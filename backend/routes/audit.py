from fastapi import APIRouter, Query
from typing import List, Dict, Any, Optional
from ..database import get_db

router = APIRouter(prefix="/api/audit", tags=["audit"])

@router.get("")
def list_audit_trail(
    entity_type: Optional[str] = None,
    user: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = 0
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM audit_log WHERE 1=1"
        params = []
        if entity_type:
            query += " AND entity_type = ?"
            params.append(entity_type)
        if user:
            query += " AND user = ?"
            params.append(user)
        query += " ORDER BY id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
