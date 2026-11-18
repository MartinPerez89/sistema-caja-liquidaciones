from pydantic import BaseModel, Field
from typing import Optional, List, Literal, Any

# Movimientos
class MovementCreate(BaseModel):
    week_id: int
    date: str
    type: Literal['INGRESO', 'EGRESO']
    amount: float = Field(gt=0, description="Importe positivo mayor a cero")
    concept: str
    category: str
    fund_source: Literal['CAJA', 'FONDOS_EXTERNOS'] = 'CAJA'
    related_entity_type: Optional[Literal['EMPLEADO', 'PROVEEDOR', 'OTRO']] = None
    related_entity_id: Optional[int] = None
    notes: Optional[str] = ""
    user: str = "Operador"

class MovementUpdate(BaseModel):
    amount: float = Field(gt=0)
    concept: str
    category: str
    fund_source: Literal['CAJA', 'FONDOS_EXTERNOS']
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    notes: Optional[str] = ""
    reason: str = Field(min_length=3, description="Motivo obligatorio del cambio para auditoría")
    user: str = "Administrador"

class MovementCancel(BaseModel):
    reason: str = Field(min_length=3, description="Motivo obligatorio de anulación para auditoría")
    user: str = "Administrador"

# Empleados
class EmployeeCreate(BaseModel):
    name: str
    weekly_salary: float = Field(gt=0)
    reference_days: int = 5
    habitual_shift: Optional[str] = "General"
    user: str = "Administrador"

class EmployeeUpdate(BaseModel):
    name: str
    weekly_salary: float = Field(gt=0)
    reference_days: int = 5
    habitual_shift: Optional[str] = "General"
    active: int = 1
    effective_from: Optional[str] = None
    reason: Optional[str] = "Actualización de condiciones salariales"
    user: str = "Administrador"

# Asistencia
class AttendanceItem(BaseModel):
    employee_id: int
    date: str
    status: Literal['TRABAJADO', 'AUSENCIA', 'FERIADO_NO_TRABAJADO', 'LICENCIA', 'OTRO_NO_TRABAJADO']
    discount_amount: Optional[float] = None
    notes: Optional[str] = ""

class AttendanceBatchUpdate(BaseModel):
    week_id: int
    items: List[AttendanceItem]
    user: str = "Operador"

# Cobertura de turnos
class ShiftCoverageCreate(BaseModel):
    week_id: int
    date: str
    absent_employee_id: int
    covering_employee_id: int
    shift_name: str = "Jornada completa"
    absent_discount: Optional[float] = None
    covering_addition: Optional[float] = None
    notes: Optional[str] = ""
    user: str = "Operador"

# Pagos
class SalaryPaymentCreate(BaseModel):
    liquidation_id: int
    date: str
    amount: float = Field(gt=0)
    fund_source: Literal['CAJA', 'FONDOS_EXTERNOS'] = 'CAJA'
    notes: Optional[str] = ""
    user: str = "Operador"

class PaymentCancel(BaseModel):
    reason: str = Field(min_length=3)
    user: str = "Administrador"

# Extracciones
class CashExtractionCreate(BaseModel):
    week_id: int
    date: str
    extraction_type: Literal['PARCIAL', 'TOTAL']
    amount: float = Field(ge=0)
    destination: str
    notes: Optional[str] = ""
    user: str = "Administrador"

# Semanas
class WeekCreate(BaseModel):
    week_code: str
    start_date: str
    end_date: str
    initial_cash: float = 0.0
    notes: Optional[str] = ""
    user: str = "Administrador"

class WeekClose(BaseModel):
    notes: Optional[str] = ""
    user: str = "Administrador"

class WeekReopen(BaseModel):
    reason: str = Field(min_length=3, description="Motivo obligatorio para reapertura de semana cerrada")
    user: str = "Administrador"

# Configuración
class SettingUpdate(BaseModel):
    key: str
    value: str
    user: str = "Administrador"
    reason: Optional[str] = "Actualización de configuración"
