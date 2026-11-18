import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "caja_liquidaciones.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high concurrency and performance
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Configuración del sistema
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 2. Empleados
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            weekly_salary REAL NOT NULL,
            reference_days INTEGER NOT NULL DEFAULT 5,
            habitual_shift TEXT DEFAULT 'General',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 3. Historial salarial de empleados
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS salary_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            weekly_salary REAL NOT NULL,
            reference_days INTEGER NOT NULL DEFAULT 5,
            effective_from TEXT NOT NULL, -- YYYY-MM-DD
            reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        );
        """)

        # 4. Reglas de cobertura configurables
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS coverage_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            absent_employee_id INTEGER,
            covering_employee_id INTEGER,
            absent_discount REAL NOT NULL,
            covering_addition REAL NOT NULL,
            effective_from TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (absent_employee_id) REFERENCES employees (id),
            FOREIGN KEY (covering_employee_id) REFERENCES employees (id)
        );
        """)

        # 5. Semanas operativas (Lunes a Viernes)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS weeks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_code TEXT NOT NULL UNIQUE, -- Ej: 2026-W47
            start_date TEXT NOT NULL, -- Lunes YYYY-MM-DD
            end_date TEXT NOT NULL,   -- Viernes YYYY-MM-DD
            initial_cash REAL NOT NULL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'CLOSED'
            closed_at TIMESTAMP,
            closed_by TEXT,
            final_cash REAL,
            reopened_at TIMESTAMP,
            reopened_by TEXT,
            reopened_reason TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 6. Categorías de movimientos
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, -- 'INGRESO', 'EGRESO'
            name TEXT NOT NULL UNIQUE,
            is_system INTEGER DEFAULT 0
        );
        """)

        # 7. Movimientos de caja
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_id INTEGER NOT NULL,
            date TEXT NOT NULL, -- YYYY-MM-DD
            type TEXT NOT NULL, -- 'INGRESO', 'EGRESO'
            amount REAL NOT NULL,
            concept TEXT NOT NULL,
            category TEXT NOT NULL,
            fund_source TEXT NOT NULL DEFAULT 'CAJA', -- 'CAJA', 'FONDOS_EXTERNOS'
            related_entity_type TEXT, -- 'EMPLEADO', 'PROVEEDOR', 'OTRO'
            related_entity_id INTEGER,
            notes TEXT,
            is_cancelled INTEGER NOT NULL DEFAULT 0,
            cancelled_reason TEXT,
            cancelled_at TIMESTAMP,
            cancelled_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (week_id) REFERENCES weeks (id)
        );
        """)

        # 8. Asistencia diaria (Lunes a Viernes)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            date TEXT NOT NULL, -- YYYY-MM-DD
            status TEXT NOT NULL, -- 'TRABAJADO', 'AUSENCIA', 'FERIADO_NO_TRABAJADO', 'LICENCIA', 'OTRO_NO_TRABAJADO'
            discount_amount REAL NOT NULL DEFAULT 0.0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(employee_id, date),
            FOREIGN KEY (week_id) REFERENCES weeks (id),
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        );
        """)

        # 9. Coberturas de turno registradas
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS shift_coverages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            absent_employee_id INTEGER NOT NULL,
            covering_employee_id INTEGER NOT NULL,
            shift_name TEXT NOT NULL DEFAULT 'Jornada completa',
            absent_discount REAL NOT NULL,
            covering_addition REAL NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (week_id) REFERENCES weeks (id),
            FOREIGN KEY (absent_employee_id) REFERENCES employees (id),
            FOREIGN KEY (covering_employee_id) REFERENCES employees (id)
        );
        """)

        # 10. Liquidaciones semanales
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS liquidations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            base_salary REAL NOT NULL,
            absent_days_count INTEGER NOT NULL DEFAULT 0,
            absent_discount_total REAL NOT NULL DEFAULT 0.0,
            coverage_addition_total REAL NOT NULL DEFAULT 0.0,
            advances_total REAL NOT NULL DEFAULT 0.0,
            previous_debt REAL NOT NULL DEFAULT 0.0,
            net_to_pay REAL NOT NULL,
            paid_amount REAL NOT NULL DEFAULT 0.0,
            remaining_debt REAL NOT NULL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'BORRADOR', -- 'BORRADOR', 'CONFIRMADA', 'PAGADA_TOTAL', 'PAGADA_PARCIAL'
            confirmed_at TIMESTAMP,
            confirmed_by TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(week_id, employee_id),
            FOREIGN KEY (week_id) REFERENCES weeks (id),
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        );
        """)

        # 11. Pagos de sueldo (Totales o Parciales)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS salary_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            liquidation_id INTEGER NOT NULL,
            week_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            fund_source TEXT NOT NULL DEFAULT 'CAJA', -- 'CAJA', 'FONDOS_EXTERNOS'
            movement_id INTEGER, -- Vinculado a movimientos si fue desde caja
            is_cancelled INTEGER NOT NULL DEFAULT 0,
            cancelled_reason TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (liquidation_id) REFERENCES liquidations (id),
            FOREIGN KEY (week_id) REFERENCES weeks (id),
            FOREIGN KEY (employee_id) REFERENCES employees (id),
            FOREIGN KEY (movement_id) REFERENCES movements (id)
        );
        """)

        # 12. Extracciones de caja
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS cash_extractions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            extraction_type TEXT NOT NULL, -- 'PARCIAL', 'TOTAL'
            amount REAL NOT NULL,
            destination TEXT NOT NULL,
            notes TEXT,
            movement_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (week_id) REFERENCES weeks (id),
            FOREIGN KEY (movement_id) REFERENCES movements (id)
        );
        """)

        # 13. Auditoría y Trazabilidad (RN-10, RF-11)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            previous_data TEXT,
            new_data TEXT,
            reason TEXT
        );
        """)

        # Sembrar datos iniciales si no existen
        seed_initial_data(cursor)

def seed_initial_data(cursor):
    # Configuración inicial
    initial_settings = [
        ("currency", "ARS", "Moneda del sistema"),
        ("currency_symbol", "$", "Símbolo monetario"),
        ("default_reference_days", "5", "Días laborables estándar por semana (L-V)"),
        ("allow_reopen_weeks", "true", "Permitir reapertura de semanas bajo autorización"),
        ("warn_duplicate_movements", "true", "Advertir ante posibles movimientos duplicados")
    ]
    for key, val, desc in initial_settings:
        cursor.execute("""
        INSERT OR IGNORE INTO settings (key, value, description)
        VALUES (?, ?, ?)
        """, (key, val, desc))

    # Categorías iniciales según RF sección 4
    categories = [
        ("INGRESO", "Ingreso diario", 1),
        ("INGRESO", "Otros ingresos", 1),
        ("INGRESO", "Saldo inicial", 1),
        ("EGRESO", "Adelanto", 1),
        ("EGRESO", "Pago semanal", 1),
        ("EGRESO", "Pago del día", 1),
        ("EGRESO", "Compra", 1),
        ("EGRESO", "Servicio", 1),
        ("EGRESO", "Internet", 1),
        ("EGRESO", "Proveedor", 1),
        ("EGRESO", "Extracción", 1),
        ("EGRESO", "Otros egresos", 1),
    ]
    for cat_type, name, is_sys in categories:
        cursor.execute("""
        INSERT OR IGNORE INTO categories (type, name, is_system)
        VALUES (?, ?, ?)
        """, (cat_type, name, is_sys))

    # Empleados iniciales según RF-03 y Sección 8: Ariel ($160.000) y Erica ($210.000)
    cursor.execute("SELECT COUNT(*) FROM employees")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO employees (name, weekly_salary, reference_days, habitual_shift, active)
        VALUES ('Ariel', 160000.0, 5, 'Turno Tarde', 1)
        """)
        ariel_id = cursor.lastrowid
        cursor.execute("""
        INSERT INTO salary_history (employee_id, weekly_salary, reference_days, effective_from, reason)
        VALUES (?, 160000.0, 5, '2026-11-16', 'Salario inicial según especificación')
        """, (ariel_id,))

        cursor.execute("""
        INSERT INTO employees (name, weekly_salary, reference_days, habitual_shift, active)
        VALUES ('Erica', 210000.0, 5, 'Turno Mañana', 1)
        """)
        erica_id = cursor.lastrowid
        cursor.execute("""
        INSERT INTO salary_history (employee_id, weekly_salary, reference_days, effective_from, reason)
        VALUES (?, 210000.0, 5, '2026-11-16', 'Salario inicial según especificación')
        """, (erica_id,))

        # Regla de cobertura inicial: si Ariel cubre a Erica:
        # Descuento a Erica: $42.000 (su valor diario), Adicional Ariel: $38.500
        cursor.execute("""
        INSERT INTO coverage_rules (name, absent_employee_id, covering_employee_id, absent_discount, covering_addition, effective_from, active)
        VALUES ('Ariel cubre a Erica', ?, ?, 42000.0, 38500.0, '2026-11-16', 1)
        """, (erica_id, ariel_id))

    # Crear la semana operativa inicial si no existe (Semana corriente: Lunes 16 Nov 2026 a Viernes 20 Nov 2026)
    cursor.execute("SELECT COUNT(*) FROM weeks")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO weeks (week_code, start_date, end_date, initial_cash, status, notes)
        VALUES ('2026-W47', '2026-11-16', '2026-11-20', 0.0, 'OPEN', 'Semana de inicio del sistema')
        """)
