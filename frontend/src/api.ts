import {
  Week,
  Movement,
  Employee,
  SalaryHistory,
  AttendanceGridEmployee,
  Liquidation,
  JointLine,
  Payment,
  CashExtraction,
  ShiftCoverage,
  AuditItem
} from './types';

let rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
if (rawApiUrl.endsWith('/')) rawApiUrl = rawApiUrl.slice(0, -1);
if (rawApiUrl.endsWith('/api')) rawApiUrl = rawApiUrl.slice(0, -4);
export const BASE_URL = rawApiUrl ? `${rawApiUrl}/api` : '/api';

export const getExcelDownloadUrl = (weekId: number) => `${BASE_URL}/reports/excel/${weekId}`;

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || 'Ocurrió un error en el servidor');
  }
  return res.json();
}

// Semanas
export const getWeeks = () => fetchJson<Week[]>('/weeks');
export const getCurrentWeek = () => fetchJson<Week>('/weeks/current');
export const getWeekById = (id: number) => fetchJson<Week>(`/weeks/${id}`);
export const createWeek = (data: { week_code: string; start_date: string; end_date: string; initial_cash: number; notes?: string; user: string }) =>
  fetchJson<{ id: number; message: string }>('/weeks', { method: 'POST', body: JSON.stringify(data) });
export const closeWeek = (id: number, data: { user: string; notes?: string }) =>
  fetchJson<{ message: string; final_cash: number; next_week_code: string; next_initial_cash: number }>(`/weeks/${id}/close`, { method: 'POST', body: JSON.stringify(data) });
export const reopenWeek = (id: number, data: { user: string; reason: string }) =>
  fetchJson<{ message: string }>(`/weeks/${id}/reopen`, { method: 'POST', body: JSON.stringify(data) });

// Movimientos
export const getMovements = (params?: { week_id?: number; type?: string; category?: string; fund_source?: string; date?: string; include_cancelled?: boolean }) => {
  const query = new URLSearchParams();
  if (params?.week_id) query.append('week_id', params.week_id.toString());
  if (params?.type) query.append('type', params.type);
  if (params?.category) query.append('category', params.category);
  if (params?.fund_source) query.append('fund_source', params.fund_source);
  if (params?.date) query.append('date', params.date);
  if (params?.include_cancelled !== undefined) query.append('include_cancelled', params.include_cancelled.toString());
  return fetchJson<Movement[]>(`/movements?${query.toString()}`);
};

export const checkDuplicateMovement = (data: any) =>
  fetchJson<{ has_potential_duplicate: boolean; count: number; duplicates: any[] }>('/movements/check-duplicate', { method: 'POST', body: JSON.stringify(data) });

export const createMovement = (data: any) =>
  fetchJson<{ id: number; message: string }>('/movements', { method: 'POST', body: JSON.stringify(data) });

export const updateMovement = (id: number, data: any) =>
  fetchJson<{ message: string }>(`/movements/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const cancelMovement = (id: number, data: { user: string; reason: string }) =>
  fetchJson<{ message: string }>(`/movements/${id}/cancel`, { method: 'POST', body: JSON.stringify(data) });

export const getCategories = () => fetchJson<{ id: number; type: string; name: string; is_system: number }[]>('/movements/categories');

// Empleados
export const getEmployees = () => fetchJson<Employee[]>('/employees');
export const getEmployeeSalaryHistory = (id: number) => fetchJson<SalaryHistory[]>(`/employees/${id}/history`);
export const createEmployee = (data: any) => fetchJson<{ id: number; message: string }>('/employees', { method: 'POST', body: JSON.stringify(data) });
export const updateEmployee = (id: number, data: any) => fetchJson<{ message: string }>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// Asistencia
export const getWeekAttendance = (weekId: number) =>
  fetchJson<{ week_id: number; week_days: string[]; grid: AttendanceGridEmployee[] }>(`/attendance/${weekId}`);
export const updateWeekAttendance = (data: { week_id: number; items: any[]; user: string }) =>
  fetchJson<{ message: string }>('/attendance/batch', { method: 'POST', body: JSON.stringify(data) });

// Coberturas
export const getWeekCoverages = (weekId: number) => fetchJson<ShiftCoverage[]>(`/coverages/${weekId}`);
export const getCoverageRules = () => fetchJson<any[]>('/coverages/rules');
export const createShiftCoverage = (data: any) => fetchJson<{ id: number; message: string }>('/coverages', { method: 'POST', body: JSON.stringify(data) });
export const deleteShiftCoverage = (id: number, user: string, reason: string) =>
  fetchJson<{ message: string }>(`/coverages/${id}?user=${encodeURIComponent(user)}&reason=${encodeURIComponent(reason)}`, { method: 'DELETE' });

// Liquidaciones
export const getWeekLiquidations = (weekId: number) =>
  fetchJson<{ week_id: number; liquidations: Liquidation[]; joint_line: JointLine | null; total_net_to_pay: number; total_paid: number; total_remaining_debt: number }>(`/liquidations/${weekId}`);
export const confirmLiquidation = (id: number, user: string) =>
  fetchJson<{ message: string }>(`/liquidations/${id}/confirm?user=${encodeURIComponent(user)}`, { method: 'POST' });

// Pagos
export const getPayments = (weekId?: number, employeeId?: number) => {
  const query = new URLSearchParams();
  if (weekId) query.append('week_id', weekId.toString());
  if (employeeId) query.append('employee_id', employeeId.toString());
  return fetchJson<Payment[]>(`/payments?${query.toString()}`);
};
export const createSalaryPayment = (data: any) =>
  fetchJson<{ id: number; movement_id: number | null; message: string; warning: string | null }>('/payments', { method: 'POST', body: JSON.stringify(data) });
export const cancelPayment = (id: number, data: { user: string; reason: string }) =>
  fetchJson<{ message: string }>(`/payments/${id}/cancel`, { method: 'POST', body: JSON.stringify(data) });

// Extracciones
export const getWeekExtractions = (weekId: number) => fetchJson<CashExtraction[]>(`/extractions/${weekId}`);
export const createExtraction = (data: any) =>
  fetchJson<{ id: number; amount: number; remaining_cash: number; message: string }>('/extractions', { method: 'POST', body: JSON.stringify(data) });

// Auditoría
export const getAuditTrail = (limit = 100, user?: string, entity_type?: string) => {
  const query = new URLSearchParams({ limit: limit.toString() });
  if (user) query.append('user', user);
  if (entity_type) query.append('entity_type', entity_type);
  return fetchJson<AuditItem[]>(`/audit?${query.toString()}`);
};

// Formato de moneda ARS
export const getTodayDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatARS = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Formateador y parser de importes para inputs con puntos de miles (es-AR)
export const formatCurrencyInput = (val: string | number | null | undefined): string => {
  if (val === '' || val === null || val === undefined) return '';

  if (typeof val === 'number') {
    if (isNaN(val)) return '';
    if (Number.isInteger(val)) {
      return val.toLocaleString('es-AR');
    }
    const parts = val.toFixed(2).split('.');
    const intPart = parseInt(parts[0], 10).toLocaleString('es-AR');
    return `${intPart},${parts[1]}`;
  }

  let str = val.toString().trim();
  if (!str) return '';

  // Si el usuario presionó punto al final (e.g. desde teclado numérico), tratarlo como coma decimal
  if (str.endsWith('.')) {
    str = str.slice(0, -1) + ',';
  }

  let intPart = '';
  let decPart: string | null = null;

  if (str.includes(',')) {
    const parts = str.split(',');
    intPart = parts[0].replace(/\D/g, '');
    decPart = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
  } else {
    intPart = str.replace(/\D/g, '');
  }

  if (!intPart && decPart === null) return '';

  const formattedInt = intPart ? parseInt(intPart, 10).toLocaleString('es-AR') : '0';

  if (decPart !== null) {
    return `${formattedInt},${decPart}`;
  }
  return formattedInt;
};

export const parseCurrencyInput = (val: string | number | null | undefined): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = val.toString().replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};
