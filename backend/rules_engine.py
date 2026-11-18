from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Optional
import datetime
import json
import sqlite3

def round_money(val: float | Decimal) -> float:
    d = Decimal(str(val))
    return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def get_employee_daily_value(conn: sqlite3.Connection, employee_id: int, on_date: Optional[str] = None) -> float:
    """Calculates daily value = weekly_salary / reference_days (RN-04)"""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT weekly_salary, reference_days 
        FROM employees 
        WHERE id = ?
    """, (employee_id,))
    row = cursor.fetchone()
    if not row:
        return 0.0
    salary = row["weekly_salary"]
    ref_days = row["reference_days"] or 5
    if ref_days <= 0:
        ref_days = 5
    return round_money(salary / ref_days)

def calculate_week_cash_balance(conn: sqlite3.Connection, week_id: int) -> Dict[str, Any]:
    """
    Calculates cash register balance according to RN-02, RN-08:
    Saldo final = saldo inicial + ingresos de caja - egresos de caja.
    Movimientos con fund_source == 'CAJA' y no anulados.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT initial_cash FROM weeks WHERE id = ?", (week_id,))
    week_row = cursor.fetchone()
    if not week_row:
        raise ValueError(f"Semana con ID {week_id} no encontrada")
    
    initial_cash = float(week_row["initial_cash"])

    # Total ingresos que afectan caja
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM movements
        WHERE week_id = ? 
          AND type = 'INGRESO'
          AND fund_source = 'CAJA'
          AND is_cancelled = 0
    """, (week_id,))
    total_incomes = float(cursor.fetchone()["total"])

    # Total egresos que afectan caja (incluyendo extracciones y pagos realizados desde caja)
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM movements
        WHERE week_id = ? 
          AND type = 'EGRESO'
          AND fund_source = 'CAJA'
          AND is_cancelled = 0
    """, (week_id,))
    total_expenses = float(cursor.fetchone()["total"])

    current_cash = round_money(initial_cash + total_incomes - total_expenses)

    # Total de pagos pendientes de liquidaciones (para proyección)
    cursor.execute("""
        SELECT COALESCE(SUM(remaining_debt), 0.0) as total_pending
        FROM liquidations
        WHERE week_id = ?
    """, (week_id,))
    pending_salary_obligations = float(cursor.fetchone()["total_pending"])

    projected_cash = round_money(current_cash - pending_salary_obligations)

    return {
        "initial_cash": initial_cash,
        "total_incomes": total_incomes,
        "total_expenses": total_expenses,
        "current_cash": current_cash,
        "pending_salary_obligations": pending_salary_obligations,
        "projected_cash": projected_cash
    }

def calculate_employee_weekly_liquidation(conn: sqlite3.Connection, week_id: int, employee_id: int) -> Dict[str, Any]:
    """
    Computes individual weekly liquidation (RF-07, RN-04, RN-05, RN-06, RN-07, RN-09):
    Net to Pay = Base Salary
                - Unworked Days Discounts (Absences, Non-worked holidays)
                + Shift Coverage Additions (as coverer)
                - Shift Coverage Deductions (as absent person covered, if not already discounted via attendance)
                - Advances in this week
                + Unpaid debt carried over from previous weeks
    """
    cursor = conn.cursor()

    # 1. Empleado y sueldo base
    cursor.execute("SELECT id, name, weekly_salary, reference_days FROM employees WHERE id = ?", (employee_id,))
    emp = cursor.fetchone()
    if not emp:
        raise ValueError(f"Empleado {employee_id} no existe")
    
    base_salary = float(emp["weekly_salary"])
    ref_days = emp["reference_days"] or 5
    daily_value = round_money(base_salary / ref_days)

    # 2. Asistencia y descuentos por días no trabajados (RN-05)
    cursor.execute("""
        SELECT date, status, discount_amount
        FROM attendance
        WHERE week_id = ? AND employee_id = ?
    """, (week_id, employee_id))
    attendance_records = cursor.fetchall()

    unworked_statuses = ['AUSENCIA', 'FERIADO_NO_TRABAJADO', 'LICENCIA', 'OTRO_NO_TRABAJADO']
    absent_days_count = 0
    absent_discount_total = 0.0
    attendance_details = []

    for att in attendance_records:
        if att["status"] in unworked_statuses:
            absent_days_count += 1
            # El descuento es el registrado o el valor diario configurado
            discount = float(att["discount_amount"]) if att["discount_amount"] > 0 else daily_value
            absent_discount_total += discount
            attendance_details.append({
                "date": att["date"],
                "status": att["status"],
                "discount": discount
            })

    absent_discount_total = round_money(absent_discount_total)

    # 3. Coberturas de turno:
    # 3a. Como reemplazante (adicional a favor, ej: Ariel cubriendo a Erica -> +$38.500)
    cursor.execute("""
        SELECT date, covering_addition, absent_employee_id, shift_name
        FROM shift_coverages
        WHERE week_id = ? AND covering_employee_id = ?
    """, (week_id, employee_id))
    coverings_done = cursor.fetchall()
    coverage_addition_total = 0.0
    coverings_done_details = []
    for cov in coverings_done:
        addition = float(cov["covering_addition"])
        coverage_addition_total += addition
        coverings_done_details.append({
            "date": cov["date"],
            "addition": addition,
            "shift": cov["shift_name"]
        })
    coverage_addition_total = round_money(coverage_addition_total)

    # 4. Adelantos recibidos durante la semana (RN-06)
    # Movimientos de egreso de categoría 'Adelanto' asociados al empleado y no anulados
    cursor.execute("""
        SELECT id, date, amount, fund_source, notes
        FROM movements
        WHERE week_id = ? 
          AND related_entity_type = 'EMPLEADO'
          AND related_entity_id = ?
          AND category = 'Adelanto'
          AND is_cancelled = 0
    """, (week_id, employee_id))
    advances_rows = cursor.fetchall()
    advances_total = sum(float(adv["amount"]) for adv in advances_rows)
    advances_total = round_money(advances_total)

    # 5. Saldo pendiente de semanas anteriores (RN-09)
    # Buscamos la semana inmediatamente anterior cronológicamente
    cursor.execute("SELECT start_date FROM weeks WHERE id = ?", (week_id,))
    current_week_start = cursor.fetchone()["start_date"]

    cursor.execute("""
        SELECT l.remaining_debt
        FROM liquidations l
        JOIN weeks w ON l.week_id = w.id
        WHERE l.employee_id = ? 
          AND w.start_date < ?
        ORDER BY w.start_date DESC
        LIMIT 1
    """, (employee_id, current_week_start))
    prev_liq = cursor.fetchone()
    previous_debt = float(prev_liq["remaining_debt"]) if prev_liq else 0.0
    previous_debt = round_money(previous_debt)

    # 6. Cálculo del neto a pagar
    net_to_pay = round_money(base_salary - absent_discount_total + coverage_addition_total - advances_total + previous_debt)

    # 7. Pagos ya registrados para esta liquidación
    cursor.execute("""
        SELECT id, date, amount, fund_source, notes, is_cancelled
        FROM salary_payments
        WHERE week_id = ? AND employee_id = ? AND is_cancelled = 0
    """, (week_id, employee_id))
    payment_rows = cursor.fetchall()
    paid_amount = sum(float(p["amount"]) for p in payment_rows)
    paid_amount = round_money(paid_amount)

    remaining_debt = round_money(max(0.0, net_to_pay - paid_amount))

    # Determinar status
    if paid_amount >= net_to_pay and net_to_pay > 0:
        status = 'PAGADA_TOTAL'
    elif paid_amount > 0:
        status = 'PAGADA_PARCIAL'
    else:
        status = 'BORRADOR'

    return {
        "employee_id": employee_id,
        "employee_name": emp["name"],
        "base_salary": base_salary,
        "daily_value": daily_value,
        "absent_days_count": absent_days_count,
        "absent_discount_total": absent_discount_total,
        "attendance_details": attendance_details,
        "coverage_addition_total": coverage_addition_total,
        "coverings_done_details": coverings_done_details,
        "advances_total": advances_total,
        "advances_rows": [dict(r) for r in advances_rows],
        "previous_debt": previous_debt,
        "net_to_pay": net_to_pay,
        "paid_amount": paid_amount,
        "remaining_debt": remaining_debt,
        "status": status,
        "payments": [dict(p) for p in payment_rows]
    }

def sync_all_weekly_liquidations(conn: sqlite3.Connection, week_id: int):
    """
    Recalculates and updates the `liquidations` table for all active employees for this week.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM employees WHERE active = 1")
    employees = cursor.fetchall()

    for emp in employees:
        emp_id = emp["id"]
        calc = calculate_employee_weekly_liquidation(conn, week_id, emp_id)

        # Check existing liquidation status
        cursor.execute("SELECT id, status FROM liquidations WHERE week_id = ? AND employee_id = ?", (week_id, emp_id))
        existing = cursor.fetchone()

        if existing:
            # Preserve status if CONFIRMADA and no payments yet
            new_status = calc["status"]
            if existing["status"] == "CONFIRMADA" and calc["status"] == "BORRADOR":
                new_status = "CONFIRMADA"

            cursor.execute("""
                UPDATE liquidations
                SET base_salary = ?,
                    absent_days_count = ?,
                    absent_discount_total = ?,
                    coverage_addition_total = ?,
                    advances_total = ?,
                    previous_debt = ?,
                    net_to_pay = ?,
                    paid_amount = ?,
                    remaining_debt = ?,
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (
                calc["base_salary"],
                calc["absent_days_count"],
                calc["absent_discount_total"],
                calc["coverage_addition_total"],
                calc["advances_total"],
                calc["previous_debt"],
                calc["net_to_pay"],
                calc["paid_amount"],
                calc["remaining_debt"],
                new_status,
                existing["id"]
            ))
        else:
            cursor.execute("""
                INSERT INTO liquidations (
                    week_id, employee_id, base_salary, absent_days_count,
                    absent_discount_total, coverage_addition_total, advances_total,
                    previous_debt, net_to_pay, paid_amount, remaining_debt, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                week_id, emp_id, calc["base_salary"], calc["absent_days_count"],
                calc["absent_discount_total"], calc["coverage_addition_total"],
                calc["advances_total"], calc["previous_debt"], calc["net_to_pay"],
                calc["paid_amount"], calc["remaining_debt"], calc["status"]
            ))

def log_audit(conn: sqlite3.Connection, user: str, action: str, entity_type: str, entity_id: str,
              previous_data: Optional[Any] = None, new_data: Optional[Any] = None, reason: Optional[str] = None):
    """
    Enforces RN-10 and RF-11 (Traceability & Audit).
    Records user, timestamp, previous data, new data, and explanation reason.
    """
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO audit_log (user, action, entity_type, entity_id, previous_data, new_data, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        user,
        action,
        entity_type,
        str(entity_id),
        json.dumps(previous_data, default=str) if previous_data is not None else None,
        json.dumps(new_data, default=str) if new_data is not None else None,
        reason or "Operación del sistema"
    ))
