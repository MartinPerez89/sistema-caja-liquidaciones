import unittest
import sqlite3
import os
import json
from decimal import Decimal

# Test database in-memory or temp file
from backend.database import init_db
from backend.rules_engine import (
    calculate_week_cash_balance,
    calculate_employee_weekly_liquidation,
    get_employee_daily_value,
    round_money
)

class TestBusinessRules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Aseguramos inicialización de base de datos
        init_db()

    def setUp(self):
        # Crear base de datos aislada en memoria para cada prueba
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        
        # Copiar esquema de database.py
        with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "database.py"), "r", encoding="utf-8") as f:
            content = f.read()
        
        # Ejecutar la inicialización en la base de datos de test
        from backend.database import seed_initial_data
        
        # Crear tablas mínimas
        cursor = self.conn.cursor()
        cursor.executescript("""
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, weekly_salary REAL NOT NULL, reference_days INTEGER NOT NULL DEFAULT 5, habitual_shift TEXT DEFAULT 'General', active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE salary_history (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, weekly_salary REAL NOT NULL, reference_days INTEGER NOT NULL DEFAULT 5, effective_from TEXT NOT NULL, reason TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE coverage_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, absent_employee_id INTEGER, covering_employee_id INTEGER, absent_discount REAL NOT NULL, covering_addition REAL NOT NULL, effective_from TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE weeks (id INTEGER PRIMARY KEY AUTOINCREMENT, week_code TEXT NOT NULL UNIQUE, start_date TEXT NOT NULL, end_date TEXT NOT NULL, initial_cash REAL NOT NULL DEFAULT 0.0, status TEXT NOT NULL DEFAULT 'OPEN', closed_at TIMESTAMP, closed_by TEXT, final_cash REAL, reopened_at TIMESTAMP, reopened_by TEXT, reopened_reason TEXT, notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, name TEXT NOT NULL UNIQUE, is_system INTEGER DEFAULT 0);
        CREATE TABLE movements (id INTEGER PRIMARY KEY AUTOINCREMENT, week_id INTEGER NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, concept TEXT NOT NULL, category TEXT NOT NULL, fund_source TEXT NOT NULL DEFAULT 'CAJA', related_entity_type TEXT, related_entity_id INTEGER, notes TEXT, is_cancelled INTEGER NOT NULL DEFAULT 0, cancelled_reason TEXT, cancelled_at TIMESTAMP, cancelled_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, week_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, discount_amount REAL NOT NULL DEFAULT 0.0, notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(employee_id, date));
        CREATE TABLE shift_coverages (id INTEGER PRIMARY KEY AUTOINCREMENT, week_id INTEGER NOT NULL, date TEXT NOT NULL, absent_employee_id INTEGER NOT NULL, covering_employee_id INTEGER NOT NULL, shift_name TEXT NOT NULL DEFAULT 'Jornada completa', absent_discount REAL NOT NULL, covering_addition REAL NOT NULL, notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE liquidations (id INTEGER PRIMARY KEY AUTOINCREMENT, week_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, base_salary REAL NOT NULL, absent_days_count INTEGER NOT NULL DEFAULT 0, absent_discount_total REAL NOT NULL DEFAULT 0.0, coverage_addition_total REAL NOT NULL DEFAULT 0.0, advances_total REAL NOT NULL DEFAULT 0.0, previous_debt REAL NOT NULL DEFAULT 0.0, net_to_pay REAL NOT NULL, paid_amount REAL NOT NULL DEFAULT 0.0, remaining_debt REAL NOT NULL DEFAULT 0.0, status TEXT NOT NULL DEFAULT 'BORRADOR', confirmed_at TIMESTAMP, confirmed_by TEXT, notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(week_id, employee_id));
        CREATE TABLE salary_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, liquidation_id INTEGER NOT NULL, week_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, date TEXT NOT NULL, amount REAL NOT NULL, fund_source TEXT NOT NULL DEFAULT 'CAJA', movement_id INTEGER, is_cancelled INTEGER NOT NULL DEFAULT 0, cancelled_reason TEXT, notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE cash_extractions (id INTEGER PRIMARY KEY AUTOINCREMENT, week_id INTEGER NOT NULL, date TEXT NOT NULL, extraction_type TEXT NOT NULL, amount REAL NOT NULL, destination TEXT NOT NULL, notes TEXT, movement_id INTEGER NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, user TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, previous_data TEXT, new_data TEXT, reason TEXT);
        """)
        seed_initial_data(cursor)
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_rn04_daily_value_calculation(self):
        """RN-04: Valor diario = Sueldo semanal / días referencia (Ariel: $32.000, Erica: $42.000)"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM employees WHERE name = 'Ariel'")
        ariel_id = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM employees WHERE name = 'Erica'")
        erica_id = cursor.fetchone()["id"]

        ariel_daily = get_employee_daily_value(self.conn, ariel_id)
        erica_daily = get_employee_daily_value(self.conn, erica_id)

        self.assertEqual(ariel_daily, 32000.0)
        self.assertEqual(erica_daily, 42000.0)

    def test_rn02_cash_balance_formula(self):
        """RN-02: Saldo final = saldo inicial + ingresos de caja - egresos de caja"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM weeks WHERE week_code = '2026-W47'")
        week_id = cursor.fetchone()["id"]

        # Cargar saldo inicial $50.000
        cursor.execute("UPDATE weeks SET initial_cash = 50000.0 WHERE id = ?", (week_id,))
        
        # Ingreso caja $100.000
        cursor.execute("""
            INSERT INTO movements (week_id, date, type, amount, concept, category, fund_source)
            VALUES (?, '2026-11-16', 'INGRESO', 100000.0, 'Cobro clientes', 'Ingreso diario', 'CAJA')
        """, (week_id,))

        # Egreso caja $30.000
        cursor.execute("""
            INSERT INTO movements (week_id, date, type, amount, concept, category, fund_source)
            VALUES (?, '2026-11-17', 'EGRESO', 30000.0, 'Compra insumos', 'Compra', 'CAJA')
        """, (week_id,))

        # Movimiento con fondos externos (NO debe afectar caja según Regla central y RN-08)
        cursor.execute("""
            INSERT INTO movements (week_id, date, type, amount, concept, category, fund_source)
            VALUES (?, '2026-11-17', 'EGRESO', 15000.0, 'Pago transferencia personal', 'Otros egresos', 'FONDOS_EXTERNOS')
        """, (week_id,))

        self.conn.commit()

        balance = calculate_week_cash_balance(self.conn, week_id)
        # Saldo = 50.000 + 100.000 - 30.000 = 120.000 (ignora los 15.000 de fondos externos)
        self.assertEqual(balance["initial_cash"], 50000.0)
        self.assertEqual(balance["total_incomes"], 100000.0)
        self.assertEqual(balance["total_expenses"], 30000.0)
        self.assertEqual(balance["current_cash"], 120000.0)

    def test_rn05_unworked_day_and_duplicate_prevention(self):
        """RN-05: Cada día no trabajado se descuenta individualmente. No duplicación de descuentos."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM weeks WHERE week_code = '2026-W47'")
        week_id = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM employees WHERE name = 'Ariel'")
        ariel_id = cursor.fetchone()["id"]

        # Registrar Ariel ausencia el martes ($32.000)
        cursor.execute("""
            INSERT INTO attendance (week_id, employee_id, date, status, discount_amount)
            VALUES (?, ?, '2026-11-17', 'AUSENCIA', 32000.0)
        """, (week_id, ariel_id))
        self.conn.commit()

        # Intentar duplicar mismo día con feriado: la restricción UNIQUE(employee_id, date) debe rechazarlo o actualizarlo
        with self.assertRaises(sqlite3.IntegrityError):
            cursor.execute("""
                INSERT INTO attendance (week_id, employee_id, date, status, discount_amount)
                VALUES (?, ?, '2026-11-17', 'FERIADO_NO_TRABAJADO', 32000.0)
            """, (week_id, ariel_id))

        liq = calculate_employee_weekly_liquidation(self.conn, week_id, ariel_id)
        # Sueldo $160.000 - $32.000 = $128.000
        self.assertEqual(liq["base_salary"], 160000.0)
        self.assertEqual(liq["absent_discount_total"], 32000.0)
        self.assertEqual(liq["net_to_pay"], 128000.0)

    def test_rn06_advances_deducted_only_once(self):
        """RN-06: Adelantos bajan la caja y el neto salarial, pero no vuelven a descontar caja al pagar el saldo."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM weeks WHERE week_code = '2026-W47'")
        week_id = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM employees WHERE name = 'Ariel'")
        ariel_id = cursor.fetchone()["id"]

        cursor.execute("UPDATE weeks SET initial_cash = 200000.0 WHERE id = ?", (week_id,))

        # Registrar adelanto de $20.000 desde caja el miércoles
        cursor.execute("""
            INSERT INTO movements (week_id, date, type, amount, concept, category, fund_source, related_entity_type, related_entity_id)
            VALUES (?, '2026-11-18', 'EGRESO', 20000.0, 'Adelanto Ariel', 'Adelanto', 'CAJA', 'EMPLEADO', ?)
        """, (week_id, ariel_id))
        self.conn.commit()

        # Liquidación de Ariel: Base $160.000 - Adelanto $20.000 = Neto $140.000
        liq = calculate_employee_weekly_liquidation(self.conn, week_id, ariel_id)
        self.assertEqual(liq["advances_total"], 20000.0)
        self.assertEqual(liq["net_to_pay"], 140000.0)

        # Saldo en caja en este momento: $200.000 - $20.000 = $180.000
        cash = calculate_week_cash_balance(self.conn, week_id)
        self.assertEqual(cash["current_cash"], 180000.0)

    def test_rn07_coverage_ariel_covers_erica(self):
        """RN-07: Cobertura Ariel cubre Erica -> Erica -$42.000, Ariel +$38.500"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM weeks WHERE week_code = '2026-W47'")
        week_id = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM employees WHERE name = 'Ariel'")
        ariel_id = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM employees WHERE name = 'Erica'")
        erica_id = cursor.fetchone()["id"]

        # Registrar cobertura el jueves: Erica ausente, Ariel cubre
        cursor.execute("""
            INSERT INTO shift_coverages (week_id, date, absent_employee_id, covering_employee_id, absent_discount, covering_addition)
            VALUES (?, '2026-11-19', ?, ?, 42000.0, 38500.0)
        """, (week_id, erica_id, ariel_id))
        # Registrar ausencia de Erica en attendance
        cursor.execute("""
            INSERT INTO attendance (week_id, employee_id, date, status, discount_amount)
            VALUES (?, ?, '2026-11-19', 'AUSENCIA', 42000.0)
        """, (week_id, erica_id))
        self.conn.commit()

        ariel_liq = calculate_employee_weekly_liquidation(self.conn, week_id, ariel_id)
        erica_liq = calculate_employee_weekly_liquidation(self.conn, week_id, erica_id)

        # Ariel: $160.000 + $38.500 = $198.500
        self.assertEqual(ariel_liq["coverage_addition_total"], 38500.0)
        self.assertEqual(ariel_liq["net_to_pay"], 198500.0)

        # Erica: $210.000 - $42.000 = $168.000
        self.assertEqual(erica_liq["absent_discount_total"], 42000.0)
        self.assertEqual(erica_liq["net_to_pay"], 168000.0)

    def test_rn08_external_funds_payment_does_not_modify_cash(self):
        """RN-08: Pago con fondos externos baja la deuda salarial pero NO modifica la caja."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM weeks WHERE week_code = '2026-W47'")
        week_id = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM employees WHERE name = 'Erica'")
        erica_id = cursor.fetchone()["id"]

        cursor.execute("UPDATE weeks SET initial_cash = 100000.0 WHERE id = ?", (week_id,))
        
        # Insertar liquidación
        cursor.execute("""
            INSERT INTO liquidations (week_id, employee_id, base_salary, net_to_pay, remaining_debt)
            VALUES (?, ?, 210000.0, 210000.0, 210000.0)
        """, (week_id, erica_id))
        liq_id = cursor.lastrowid

        # Registrar pago de $50.000 mediante FONDOS_EXTERNOS
        cursor.execute("""
            INSERT INTO salary_payments (liquidation_id, week_id, employee_id, date, amount, fund_source)
            VALUES (?, ?, ?, '2026-11-20', 50000.0, 'FONDOS_EXTERNOS')
        """, (liq_id, week_id, erica_id))
        self.conn.commit()

        # Verificar saldo en caja: debe seguir siendo $100.000 intactos
        cash = calculate_week_cash_balance(self.conn, week_id)
        self.assertEqual(cash["current_cash"], 100000.0)

        # Verificar liquidación: la deuda baja a $160.000
        liq = calculate_employee_weekly_liquidation(self.conn, week_id, erica_id)
        self.assertEqual(liq["paid_amount"], 50000.0)
        self.assertEqual(liq["remaining_debt"], 160000.0)

    def test_rn09_unpaid_difference_carries_over_to_next_week(self):
        """RN-09: La diferencia no pagada queda como pendiente y se traslada a la siguiente semana."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM weeks WHERE week_code = '2026-W47'")
        week1_id = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM employees WHERE name = 'Ariel'")
        ariel_id = cursor.fetchone()["id"]

        # Semana 1: Sueldo $160.000, se pagan solo $100.000. Restan $60.000.
        cursor.execute("""
            INSERT INTO liquidations (week_id, employee_id, base_salary, net_to_pay, paid_amount, remaining_debt, status)
            VALUES (?, ?, 160000.0, 160000.0, 100000.0, 60000.0, 'PAGADA_PARCIAL')
        """, (week1_id, ariel_id))

        # Crear Semana 2: 2026-W48
        cursor.execute("""
            INSERT INTO weeks (week_code, start_date, end_date, initial_cash, status)
            VALUES ('2026-W48', '2026-11-23', '2026-11-27', 0.0, 'OPEN')
        """,)
        week2_id = cursor.lastrowid
        self.conn.commit()

        # Liquidación de Semana 2 para Ariel:
        # Base $160.000 + Deuda previa $60.000 = $220.000
        liq_w2 = calculate_employee_weekly_liquidation(self.conn, week2_id, ariel_id)
        self.assertEqual(liq_w2["previous_debt"], 60000.0)
        self.assertEqual(liq_w2["net_to_pay"], 220000.0)

if __name__ == "__main__":
    unittest.main()
