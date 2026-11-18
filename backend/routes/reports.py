from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from typing import Optional
import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from ..database import get_db
from ..rules_engine import calculate_week_cash_balance, calculate_employee_weekly_liquidation, round_money

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/summary/{week_id}")
def get_week_full_summary(week_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM weeks WHERE id = ?", (week_id,))
        week = cursor.fetchone()
        if not week:
            raise HTTPException(status_code=404, detail="Semana no encontrada")

        cash_balance = calculate_week_cash_balance(conn, week_id)

        # Movimientos
        cursor.execute("""
            SELECT m.*, e.name as employee_name
            FROM movements m
            LEFT JOIN employees e ON m.related_entity_type = 'EMPLEADO' AND m.related_entity_id = e.id
            WHERE m.week_id = ?
            ORDER BY m.date ASC, m.id ASC
        """, (week_id,))
        movements = [dict(r) for r in cursor.fetchall()]

        # Liquidaciones individuales
        cursor.execute("SELECT id, name FROM employees WHERE active = 1 ORDER BY id ASC")
        employees = cursor.fetchall()
        liquidations = [calculate_employee_weekly_liquidation(conn, week_id, emp["id"]) for emp in employees]

        # Pagos
        cursor.execute("""
            SELECT sp.*, e.name as employee_name
            FROM salary_payments sp
            JOIN employees e ON sp.employee_id = e.id
            WHERE sp.week_id = ?
            ORDER BY sp.date ASC
        """, (week_id,))
        payments = [dict(r) for r in cursor.fetchall()]

        # Extracciones
        cursor.execute("""
            SELECT * FROM cash_extractions WHERE week_id = ? ORDER BY date ASC
        """, (week_id,))
        extractions = [dict(r) for r in cursor.fetchall()]

        # Coberturas
        cursor.execute("""
            SELECT sc.*, e1.name as absent_name, e2.name as covering_name
            FROM shift_coverages sc
            JOIN employees e1 ON sc.absent_employee_id = e1.id
            JOIN employees e2 ON sc.covering_employee_id = e2.id
            WHERE sc.week_id = ?
            ORDER BY sc.date ASC
        """, (week_id,))
        coverages = [dict(r) for r in cursor.fetchall()]

        return {
            "week": dict(week),
            "cash_balance": cash_balance,
            "movements": movements,
            "liquidations": liquidations,
            "payments": payments,
            "extractions": extractions,
            "coverages": coverages
        }

@router.get("/excel/{week_id}")
def export_week_excel(week_id: int):
    summary = get_week_full_summary(week_id)
    week = summary["week"]
    cash = summary["cash_balance"]

    wb = openpyxl.Workbook()
    # Estilos
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color="0F172A")
    bold_font = Font(name="Calibri", size=11, bold=True)
    border_thin = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # 1. HOJA: RESUMEN DE CAJA
    ws_resumen = wb.active
    ws_resumen.title = "Resumen de Caja"
    ws_resumen.views.sheetView[0].showGridLines = True

    ws_resumen.append([f"SISTEMA DE GESTIÓN DE CAJA Y LIQUIDACIÓN - SEMANA {week['week_code']}"])
    ws_resumen["A1"].font = title_font
    ws_resumen.append([f"Período: {week['start_date']} al {week['end_date']} | Estado: {week['status']}"])
    ws_resumen.append([])

    ws_resumen.append(["Concepto de Caja", "Importe (ARS)"])
    ws_resumen.append(["Saldo Inicial de Caja", cash["initial_cash"]])
    ws_resumen.append(["Total Ingresos de Caja", cash["total_incomes"]])
    ws_resumen.append(["Total Egresos de Caja", cash["total_expenses"]])
    ws_resumen.append(["Saldo Actual en Efectivo", cash["current_cash"]])
    ws_resumen.append(["Obligaciones Salariales Pendientes", cash["pending_salary_obligations"]])
    ws_resumen.append(["Saldo Proyectado tras Pagos", cash["projected_cash"]])

    for row_idx in range(4, 11):
        cell_a = ws_resumen[f"A{row_idx}"]
        cell_b = ws_resumen[f"B{row_idx}"]
        cell_a.border = border_thin
        cell_b.border = border_thin
        cell_b.number_format = "$#,##0.00"
        if row_idx == 4:
            cell_a.fill = header_fill
            cell_a.font = header_font
            cell_b.fill = header_fill
            cell_b.font = header_font
        elif row_idx in [8, 10]:
            cell_a.font = bold_font
            cell_b.font = bold_font

    # 2. HOJA: MOVIMIENTOS
    ws_mov = wb.create_sheet(title="Movimientos")
    ws_mov.views.sheetView[0].showGridLines = True
    mov_headers = ["ID", "Fecha", "Tipo", "Importe", "Categoría", "Origen Fondos", "Concepto", "Beneficiario/Ref", "Anulado", "Notas"]
    ws_mov.append(mov_headers)
    for col_num in range(1, len(mov_headers) + 1):
        cell = ws_mov.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font

    for m in summary["movements"]:
        ws_mov.append([
            m["id"],
            m["date"],
            m["type"],
            m["amount"],
            m["category"],
            m["fund_source"],
            m["concept"],
            m.get("employee_name") or "",
            "SÍ" if m["is_cancelled"] == 1 else "NO",
            m["notes"] or ""
        ])

    for row in ws_mov.iter_rows(min_row=2, max_col=10):
        row[3].number_format = "$#,##0.00"

    # 3. HOJA: LIQUIDACIONES SEMANALES
    ws_liq = wb.create_sheet(title="Liquidaciones")
    ws_liq.views.sheetView[0].showGridLines = True
    liq_headers = [
        "Empleado", "Sueldo Base", "Días Ausente", "Desc. Inasistencias", 
        "Adic. Coberturas", "Adelantos", "Deuda Semanas Prev.", "Neto a Pagar", 
        "Pagado", "Saldo Pendiente", "Estado"
    ]
    ws_liq.append(liq_headers)
    for col_num in range(1, len(liq_headers) + 1):
        cell = ws_liq.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font

    for l in summary["liquidations"]:
        ws_liq.append([
            l["employee_name"],
            l["base_salary"],
            l["absent_days_count"],
            l["absent_discount_total"],
            l["coverage_addition_total"],
            l["advances_total"],
            l["previous_debt"],
            l["net_to_pay"],
            l["paid_amount"],
            l["remaining_debt"],
            l["status"]
        ])

    for row in ws_liq.iter_rows(min_row=2, max_col=11):
        for col_idx in [1, 3, 4, 5, 6, 7, 8, 9]:
            row[col_idx].number_format = "$#,##0.00"

    # 4. HOJA: PAGOS
    ws_pag = wb.create_sheet(title="Pagos Salariales")
    ws_pag.views.sheetView[0].showGridLines = True
    pag_headers = ["ID Pago", "Fecha", "Empleado", "Importe", "Origen Fondos", "Afectó Caja", "Estado", "Notas"]
    ws_pag.append(pag_headers)
    for col_num in range(1, len(pag_headers) + 1):
        cell = ws_pag.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font

    for p in summary["payments"]:
        ws_pag.append([
            p["id"],
            p["date"],
            p.get("employee_name") or "",
            p["amount"],
            p["fund_source"],
            "SÍ (Egreso Caja)" if p["fund_source"] == "CAJA" else "NO (Fondos Externos)",
            "ANULADO" if p["is_cancelled"] == 1 else "ACTIVO",
            p["notes"] or ""
        ])

    for row in ws_pag.iter_rows(min_row=2, max_col=8):
        row[3].number_format = "$#,##0.00"

    # Ajustar ancho de columnas
    for sheet in wb.worksheets:
        for col in sheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            sheet.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"Reporte_Caja_Liquidaciones_{week['week_code']}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
