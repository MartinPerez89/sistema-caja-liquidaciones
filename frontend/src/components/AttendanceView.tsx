import React, { useState, useEffect } from 'react';
import { Week, AttendanceGridEmployee, ShiftCoverage, Employee } from '../types';
import {
  getWeekAttendance,
  updateWeekAttendance,
  getWeekCoverages,
  createShiftCoverage,
  deleteShiftCoverage,
  getEmployees,
  formatARS,
  formatCurrencyInput,
  parseCurrencyInput
} from '../api';
import {
  CalendarCheck,
  Save,
  AlertCircle,
  UserCheck,
  UserX,
  HelpCircle,
  Plus,
  Trash2,
  Calendar
} from 'lucide-react';

interface AttendanceViewProps {
  currentWeek: Week | null;
  userRole: 'Administrador' | 'Operador';
  onRefreshWeek: () => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  currentWeek,
  userRole,
  onRefreshWeek,
}) => {
  const [grid, setGrid] = useState<AttendanceGridEmployee[]>([]);
  const [weekDays, setWeekDays] = useState<string[]>([]);
  const [coverages, setCoverages] = useState<ShiftCoverage[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Modal nueva cobertura
  const [showCoverageModal, setShowCoverageModal] = useState(false);
  const [coverageForm, setCoverageForm] = useState({
    date: currentWeek?.start_date || '',
    absent_employee_id: '',
    covering_employee_id: '',
    shift_name: 'Jornada completa',
    absent_discount: '',
    covering_addition: '',
    notes: '',
  });

  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

  const loadAttendance = async () => {
    if (!currentWeek) return;
    setLoading(true);
    try {
      const [attData, covData, empData] = await Promise.all([
        getWeekAttendance(currentWeek.id),
        getWeekCoverages(currentWeek.id),
        getEmployees(),
      ]);
      setGrid(attData.grid);
      setWeekDays(attData.week_days);
      setCoverages(covData);
      setEmployees(empData);
      setHasChanges(false);

      if (empData.length >= 2) {
        // Pre-seleccionar Erica como ausente y Ariel como reemplazante según regla inicial
        const erica = empData.find((e) => e.name.toLowerCase() === 'erica');
        const ariel = empData.find((e) => e.name.toLowerCase() === 'ariel');
        setCoverageForm((prev) => ({
          ...prev,
          date: currentWeek.start_date,
          absent_employee_id: erica ? erica.id.toString() : empData[0].id.toString(),
          covering_employee_id: ariel ? ariel.id.toString() : empData[1].id.toString(),
          absent_discount: '42.000',
          covering_addition: '38.500',
        }));
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [currentWeek]);

  const handleStatusChange = (
    empIndex: number,
    dayIndex: number,
    newStatus: 'TRABAJADO' | 'AUSENCIA' | 'FERIADO_NO_TRABAJADO' | 'LICENCIA' | 'OTRO_NO_TRABAJADO'
  ) => {
    setGrid((prevGrid) => {
      const newGrid = [...prevGrid];
      const emp = { ...newGrid[empIndex] };
      const days = [...emp.days];
      const targetDay = { ...days[dayIndex], status: newStatus };

      if (newStatus !== 'TRABAJADO') {
        targetDay.discount_amount = emp.daily_value;
      } else {
        targetDay.discount_amount = 0;
      }

      days[dayIndex] = targetDay;
      emp.days = days;

      // Recalcular totales para el empleado
      let totalDiscount = 0;
      let absentCount = 0;
      days.forEach((d) => {
        if (d.status !== 'TRABAJADO') {
          totalDiscount += d.discount_amount;
          absentCount += 1;
        }
      });
      emp.total_discount = totalDiscount;
      emp.absent_days = absentCount;

      newGrid[empIndex] = emp;
      return newGrid;
    });
    setHasChanges(true);
  };

  const handleSaveAttendance = async () => {
    if (!currentWeek) return;
    setSaving(true);
    try {
      const items: any[] = [];
      grid.forEach((emp) => {
        emp.days.forEach((d) => {
          items.push({
            employee_id: emp.employee_id,
            date: d.date,
            status: d.status,
            discount_amount: d.discount_amount,
            notes: d.notes,
          });
        });
      });

      await updateWeekAttendance({
        week_id: currentWeek.id,
        items,
        user: userRole,
      });

      setHasChanges(false);
      onRefreshWeek();
      loadAttendance();
      alert('Asistencia semanal guardada y liquidaciones sincronizadas correctamente.');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCoverage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWeek) return;
    if (coverageForm.absent_employee_id === coverageForm.covering_employee_id) {
      alert('El empleado ausente y el que cubre no pueden ser la misma persona');
      return;
    }

    try {
      await createShiftCoverage({
        week_id: currentWeek.id,
        date: coverageForm.date,
        absent_employee_id: Number(coverageForm.absent_employee_id),
        covering_employee_id: Number(coverageForm.covering_employee_id),
        shift_name: coverageForm.shift_name,
        absent_discount: coverageForm.absent_discount ? parseCurrencyInput(coverageForm.absent_discount) : undefined,
        covering_addition: coverageForm.covering_addition ? parseCurrencyInput(coverageForm.covering_addition) : undefined,
        notes: coverageForm.notes,
        user: userRole,
      });
      setShowCoverageModal(false);
      onRefreshWeek();
      loadAttendance();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteCoverage = async (id: number) => {
    if (!confirm('¿Confirma que desea eliminar este registro de cobertura? Se recalcularán las liquidaciones.')) return;
    try {
      await deleteShiftCoverage(id, userRole, 'Eliminación manual desde panel de asistencia');
      onRefreshWeek();
      loadAttendance();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado y guardado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Grilla de Asistencia Semanal (Lunes a Viernes)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Control de inasistencias, licencias y feriados no trabajados (RF-04, RN-05).
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {hasChanges && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 animate-pulse">
              ● Cambios pendientes de guardar
            </span>
          )}
          <button
            onClick={handleSaveAttendance}
            disabled={saving || currentWeek?.status === 'CLOSED'}
            className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Asistencia'}</span>
          </button>
        </div>
      </div>

      {/* Regla de negocio explicada */}
      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl p-3.5 text-xs text-blue-900 dark:text-blue-200 flex items-start space-x-2">
        <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Política vigente de descuentos (RN-05):</span> Cada día no trabajado (incluyendo feriados no trabajados o ausencias) descuenta el valor diario estipulado del sueldo semanal del empleado. El descuento es estrictamente individual.
        </div>
      </div>

      {/* Grilla interactiva de asistencia */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <th className="py-3 px-4 min-w-[160px]">Empleado</th>
                {weekDays.map((d, idx) => (
                  <th key={d} className="py-3 px-3 text-center min-w-[130px]">
                    <div>{dayNames[idx]}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">{d.slice(5)}</div>
                  </th>
                ))}
                <th className="py-3 px-4 text-center">Días No Trab.</th>
                <th className="py-3 px-4 text-right">Descuento Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {grid.map((emp, empIdx) => (
                <tr key={emp.employee_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-4 px-4">
                    <div className="font-bold text-slate-900 dark:text-white text-sm">{emp.employee_name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Valor diario: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatARS(emp.daily_value)}</span>
                    </div>
                  </td>

                  {emp.days.map((day, dayIdx) => {
                    const isWorked = day.status === 'TRABAJADO';
                    return (
                      <td key={day.date} className="py-3 px-2 text-center">
                        <select
                          value={day.status}
                          disabled={currentWeek?.status === 'CLOSED'}
                          onChange={(e) => handleStatusChange(empIdx, dayIdx, e.target.value as any)}
                          className={`w-full text-xs font-semibold rounded-lg px-2 py-1.5 border transition-all cursor-pointer ${
                            isWorked
                              ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/60'
                              : day.status === 'AUSENCIA'
                              ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800/60'
                              : day.status === 'FERIADO_NO_TRABAJADO'
                              ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800/60'
                              : 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/60'
                          }`}
                        >
                          <option value="TRABAJADO">✓ Trabajó</option>
                          <option value="AUSENCIA">✕ Ausente</option>
                          <option value="FERIADO_NO_TRABAJADO">★ Feriado</option>
                          <option value="LICENCIA">Licencia</option>
                          <option value="OTRO_NO_TRABAJADO">Otro no trab.</option>
                        </select>
                        {!isWorked && (
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1">
                            -{formatARS(day.discount_amount)}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  <td className="py-4 px-4 text-center font-bold text-slate-700 dark:text-slate-300">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs ${
                        emp.absent_days > 0
                          ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 dark:border dark:border-rose-800/50'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {emp.absent_days} {emp.absent_days === 1 ? 'día' : 'días'}
                    </span>
                  </td>

                  <td className="py-4 px-4 text-right font-extrabold text-sm text-rose-600 dark:text-rose-400">
                    {emp.total_discount > 0 ? `-${formatARS(emp.total_discount)}` : '$0,00'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sección Cobertura de Turnos (RF-06, RN-07) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Cobertura de Turnos y Adicionales (RF-06, RN-07)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ejemplo regla inicial: Ariel cubre turno de Erica (-$42.000 a Erica, +$38.500 a Ariel).
            </p>
          </div>

          <button
            onClick={() => setShowCoverageModal(true)}
            disabled={currentWeek?.status === 'CLOSED'}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Registrar Cobertura</span>
          </button>
        </div>

        {coverages.length === 0 ? (
          <div className="text-xs text-slate-400 dark:text-slate-500 p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center">
            No se han registrado coberturas de turno en esta semana.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase font-semibold text-[10px]">
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Empleado Ausente</th>
                  <th className="py-2.5 px-3">Empleado que Cubre</th>
                  <th className="py-2.5 px-3">Turno</th>
                  <th className="py-2.5 px-3 text-right">Descuento Ausente</th>
                  <th className="py-2.5 px-3 text-right">Adicional Reemplazante</th>
                  <th className="py-2.5 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {coverages.map((cov) => (
                  <tr key={cov.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">{cov.date}</td>
                    <td className="py-2.5 px-3 font-semibold text-rose-700 dark:text-rose-400">{cov.absent_name}</td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-700 dark:text-emerald-400">{cov.covering_name}</td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{cov.shift_name}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                      -{formatARS(cov.absent_discount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatARS(cov.covering_addition)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => handleDeleteCoverage(cov.id)}
                        disabled={currentWeek?.status === 'CLOSED'}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="Eliminar cobertura"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Registrar Cobertura */}
      {showCoverageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Registrar Cobertura de Turno</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Indique quién estuvo ausente y quién realizó la cobertura.
            </p>

            <form onSubmit={handleCreateCoverage} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Fecha de la cobertura</label>
                <input
                  type="date"
                  required
                  value={coverageForm.date}
                  onChange={(e) => setCoverageForm({ ...coverageForm, date: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Empleado Ausente</label>
                  <select
                    required
                    value={coverageForm.absent_employee_id}
                    onChange={(e) => setCoverageForm({ ...coverageForm, absent_employee_id: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Seleccione...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Empleado que Cubre</label>
                  <select
                    required
                    value={coverageForm.covering_employee_id}
                    onChange={(e) => setCoverageForm({ ...coverageForm, covering_employee_id: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Seleccione...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Descuento al Ausente ($ ARS)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 dark:text-slate-500 font-bold text-xs select-none">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej: 42.000"
                      value={coverageForm.absent_discount}
                      onChange={(e) => setCoverageForm({ ...coverageForm, absent_discount: formatCurrencyInput(e.target.value) })}
                      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg p-2 pl-7 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Adicional al que Cubre ($ ARS)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 dark:text-slate-500 font-bold text-xs select-none">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej: 38.500"
                      value={coverageForm.covering_addition}
                      onChange={(e) => setCoverageForm({ ...coverageForm, covering_addition: formatCurrencyInput(e.target.value) })}
                      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg p-2 pl-7 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Turno cubierto</label>
                <input
                  type="text"
                  value={coverageForm.shift_name}
                  onChange={(e) => setCoverageForm({ ...coverageForm, shift_name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Observaciones</label>
                <input
                  type="text"
                  placeholder="Detalles adicionales..."
                  value={coverageForm.notes}
                  onChange={(e) => setCoverageForm({ ...coverageForm, notes: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCoverageModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  Guardar Cobertura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
