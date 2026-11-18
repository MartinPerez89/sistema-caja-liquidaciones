import React, { useState, useEffect } from 'react';
import { Employee, SalaryHistory } from '../types';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  getEmployeeSalaryHistory,
  formatARS
} from '../api';
import {
  Users,
  UserPlus,
  Edit2,
  History,
  CheckCircle,
  XCircle,
  Clock,
  ShieldAlert,
  Calendar
} from 'lucide-react';

interface EmployeesViewProps {
  userRole: 'Administrador' | 'Operador';
  onRefreshWeek: () => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({ userRole, onRefreshWeek }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal editar / crear
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    weekly_salary: '',
    reference_days: '5',
    habitual_shift: 'Turno Mañana',
    active: 1,
    effective_from: new Date().toISOString().slice(0, 10),
    reason: '',
  });

  // Modal historial salarial
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([]);
  const [historyEmpName, setHistoryEmpName] = useState('');

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedEmpId(null);
    setFormData({
      name: '',
      weekly_salary: '',
      reference_days: '5',
      habitual_shift: 'Turno General',
      active: 1,
      effective_from: new Date().toISOString().slice(0, 10),
      reason: 'Alta de nuevo empleado',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setIsEditing(true);
    setSelectedEmpId(emp.id);
    setFormData({
      name: emp.name,
      weekly_salary: emp.weekly_salary.toString(),
      reference_days: emp.reference_days.toString(),
      habitual_shift: emp.habitual_shift || 'General',
      active: emp.active,
      effective_from: new Date().toISOString().slice(0, 10),
      reason: '',
    });
    setShowModal(true);
  };

  const handleViewHistory = async (emp: Employee) => {
    try {
      const history = await getEmployeeSalaryHistory(emp.id);
      setSalaryHistory(history);
      setHistoryEmpName(emp.name);
      setShowHistoryModal(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const salaryNum = parseFloat(formData.weekly_salary);
    const refDaysNum = parseInt(formData.reference_days, 10);
    if (isNaN(salaryNum) || salaryNum <= 0) {
      alert('Ingrese un sueldo semanal válido mayor a cero');
      return;
    }
    if (isNaN(refDaysNum) || refDaysNum <= 0) {
      alert('Los días de referencia deben ser mayor a cero (habitualmente 5)');
      return;
    }

    try {
      if (isEditing && selectedEmpId) {
        if (!formData.reason.trim()) {
          alert('Por favor indique el motivo del cambio para conservar la trazabilidad histórica (RF-03)');
          return;
        }
        await updateEmployee(selectedEmpId, {
          name: formData.name.trim(),
          weekly_salary: salaryNum,
          reference_days: refDaysNum,
          habitual_shift: formData.habitual_shift,
          active: formData.active,
          effective_from: formData.effective_from,
          reason: formData.reason.trim(),
          user: userRole,
        });
      } else {
        await createEmployee({
          name: formData.name.trim(),
          weekly_salary: salaryNum,
          reference_days: refDaysNum,
          habitual_shift: formData.habitual_shift,
          user: userRole,
        });
      }

      setShowModal(false);
      loadEmployees();
      onRefreshWeek();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Administración de Personal (RF-03)</h2>
          <p className="text-xs text-slate-500">
            Fichas de empleados, salarios semanales base, turnos y vigencia histórica.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Nuevo Empleado</span>
        </button>
      </div>

      {/* Tarjetas de empleados */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {employees.map((emp) => {
          const dailyVal = emp.weekly_salary / (emp.reference_days || 5);
          return (
            <div
              key={emp.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{emp.name}</h3>
                    <span className="text-[11px] text-slate-500 font-medium">{emp.habitual_shift}</span>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      emp.active === 1
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {emp.active === 1 ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="mt-4 bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Sueldo Semanal:</span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      {formatARS(emp.weekly_salary)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Días de Referencia:</span>
                    <span className="font-semibold text-slate-700">{emp.reference_days} días (Lunes a Viernes)</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                    <span className="text-slate-600 font-medium">Valor Diario (RN-04):</span>
                    <span className="font-bold text-emerald-700">{formatARS(dailyVal)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleOpenEdit(emp)}
                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar Ficha</span>
                </button>
                <button
                  onClick={() => handleViewHistory(emp)}
                  className="flex items-center justify-center space-x-1 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600 transition-colors"
                  title="Historial salarial y de vigencias"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Historial</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Editar / Crear */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {isEditing ? `Editar Condiciones de ${formData.name}` : 'Registrar Nuevo Empleado'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Los cambios salariales guardan trazabilidad histórica y fecha de vigencia (RF-03).
            </p>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nombre completo</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Sueldo Semanal ($ ARS)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={formData.weekly_salary}
                    onChange={(e) => setFormData({ ...formData, weekly_salary: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Días de referencia</label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    required
                    value={formData.reference_days}
                    onChange={(e) => setFormData({ ...formData, reference_days: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {formData.weekly_salary && formData.reference_days && (
                <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-lg border border-emerald-200 font-medium">
                  Valor diario derivado: {formatARS(parseFloat(formData.weekly_salary) / parseInt(formData.reference_days, 10))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Turno habitual</label>
                  <input
                    type="text"
                    value={formData.habitual_shift}
                    onChange={(e) => setFormData({ ...formData, habitual_shift: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Estado</label>
                  <select
                    value={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={1}>Activo</option>
                    <option value={0}>Inactivo</option>
                  </select>
                </div>
              </div>

              {isEditing && (
                <>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Rige a partir de fecha</label>
                    <input
                      type="date"
                      required
                      value={formData.effective_from}
                      onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Motivo del cambio (Obligatorio para auditoría)
                    </label>
                    <textarea
                      rows={2}
                      required
                      placeholder="Ej: Aumento paritario, ajuste de días de cálculo..."
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
                >
                  {isEditing ? 'Guardar Cambios' : 'Crear Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial Salarial */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center space-x-2 mb-2 text-slate-900">
              <History className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-bold">Historial Salarial — {historyEmpName}</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Registro histórico de modificaciones y vigencias (RF-03, RN-10).
            </p>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px]">
                    <th className="p-2.5">Vigencia Desde</th>
                    <th className="p-2.5 text-right">Sueldo Semanal</th>
                    <th className="p-2.5 text-right">Valor Diario</th>
                    <th className="p-2.5">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salaryHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="p-2.5 font-medium text-slate-700 whitespace-nowrap">{h.effective_from}</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">{formatARS(h.weekly_salary)}</td>
                      <td className="p-2.5 text-right font-medium text-emerald-700">
                        {formatARS(h.weekly_salary / (h.reference_days || 5))}
                      </td>
                      <td className="p-2.5 text-slate-600">{h.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
