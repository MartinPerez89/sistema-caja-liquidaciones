export interface Week {
  id: number;
  week_code: string;
  start_date: string;
  end_date: string;
  initial_cash: number;
  status: 'OPEN' | 'CLOSED';
  closed_at: string | null;
  closed_by: string | null;
  final_cash: number | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopened_reason: string | null;
  notes: string | null;
  balance?: CashBalance;
}

export interface CashBalance {
  initial_cash: number;
  total_incomes: number;
  total_expenses: number;
  current_cash: number;
  pending_salary_obligations: number;
  projected_cash: number;
}

export interface Movement {
  id: number;
  week_id: number;
  date: string;
  type: 'INGRESO' | 'EGRESO';
  amount: number;
  concept: string;
  category: string;
  fund_source: 'CAJA' | 'FONDOS_EXTERNOS';
  related_entity_type?: 'EMPLEADO' | 'PROVEEDOR' | 'OTRO' | null;
  related_entity_id?: number | null;
  employee_name?: string | null;
  notes?: string;
  is_cancelled: number;
  cancelled_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  created_at: string;
}

export interface Employee {
  id: number;
  name: string;
  weekly_salary: number;
  reference_days: number;
  daily_value: number;
  habitual_shift: string;
  active: number;
}

export interface SalaryHistory {
  id: number;
  employee_id: number;
  weekly_salary: number;
  reference_days: number;
  effective_from: string;
  reason: string;
  created_at: string;
}

export interface AttendanceDay {
  date: string;
  status: 'TRABAJADO' | 'AUSENCIA' | 'FERIADO_NO_TRABAJADO' | 'LICENCIA' | 'OTRO_NO_TRABAJADO';
  discount_amount: number;
  notes: string;
}

export interface AttendanceGridEmployee {
  employee_id: number;
  employee_name: string;
  daily_value: number;
  days: AttendanceDay[];
  total_discount: number;
  absent_days: number;
}

export interface Liquidation {
  employee_id: number;
  employee_name: string;
  base_salary: number;
  daily_value: number;
  absent_days_count: number;
  absent_discount_total: number;
  coverage_addition_total: number;
  advances_total: number;
  previous_debt: number;
  net_to_pay: number;
  paid_amount: number;
  remaining_debt: number;
  status: 'BORRADOR' | 'CONFIRMADA' | 'PAGADA_TOTAL' | 'PAGADA_PARCIAL';
  liquidation_id?: number;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  attendance_details?: any[];
  coverings_done_details?: any[];
  advances_rows?: any[];
  payments?: any[];
}

export interface JointLine {
  ariel_net: number;
  ariel_paid: number;
  ariel_remaining: number;
  erica_net: number;
  erica_paid: number;
  erica_remaining: number;
  combined_net: number;
  combined_paid: number;
  combined_remaining: number;
  summary_text: string;
}

export interface Payment {
  id: number;
  liquidation_id: number;
  week_id: number;
  employee_id: number;
  employee_name?: string;
  week_code?: string;
  date: string;
  amount: number;
  fund_source: 'CAJA' | 'FONDOS_EXTERNOS';
  movement_id?: number | null;
  is_cancelled: number;
  cancelled_reason?: string | null;
  notes?: string;
}

export interface CashExtraction {
  id: number;
  week_id: number;
  date: string;
  extraction_type: 'PARCIAL' | 'TOTAL';
  amount: number;
  destination: string;
  notes?: string;
  movement_id: number;
  created_at: string;
}

export interface ShiftCoverage {
  id: number;
  week_id: number;
  date: string;
  absent_employee_id: number;
  covering_employee_id: number;
  absent_name?: string;
  covering_name?: string;
  shift_name: string;
  absent_discount: number;
  covering_addition: number;
  notes?: string;
}

export interface AuditItem {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  entity_type: string;
  entity_id: string;
  previous_data: string | null;
  new_data: string | null;
  reason: string;
}
