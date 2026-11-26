import React, { useState, useEffect } from 'react';
import { Week, Movement, Employee } from '../types';
import {
  getMovements,
  createMovement,
  cancelMovement,
  checkDuplicateMovement,
  getCategories,
  getEmployees,
  formatARS,
  getTodayDate
} from '../api';
import {
  PlusCircle,
  AlertTriangle,
  Filter,
  Ban,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
  CheckCircle2
} from 'lucide-react';

interface CashRegisterViewProps {
  currentWeek: Week | null;
  userRole: 'Administrador' | 'Operador';
  onRefreshWeek: () => void;
}

export const CashRegisterView: React.FC<CashRegisterViewProps> = ({
  currentWeek,
  userRole,
  onRefreshWeek,
}) => {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<{ id: number; type: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterFundSource, setFilterFundSource] = useState<string>('ALL');
  const [showCancelled, setShowCancelled] = useState<boolean>(false);

  // Formulario nuevo movimiento
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    date: getTodayDate(),
    type: 'EGRESO' as 'INGRESO' | 'EGRESO',
    amount: '',
    category: 'Compra',
    concept: '',
    fund_source: 'CAJA' as 'CAJA' | 'FONDOS_EXTERNOS',
    related_entity_type: 'OTRO' as 'EMPLEADO' | 'PROVEEDOR' | 'OTRO',
    related_entity_id: '' as string,
    notes: '',
  });

  // Alerta de duplicado
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null);
  const [confirmDuplicateProceed, setConfirmDuplicateProceed] = useState(false);

  // Modal de anulación
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [movementToCancel, setMovementToCancel] = useState<Movement | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadData = async () => {
    if (!currentWeek) return;
    setLoading(true);
    try {
      const [movs, emps, cats] = await Promise.all([
        getMovements({ week_id: currentWeek.id, include_cancelled: showCancelled }),
        getEmployees(),
        getCategories(),
      ]);
      setMovements(movs);
      setEmployees(emps);
      setCategories(cats);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentWeek, showCancelled]);

  const handleOpenModal = (defaultType: 'INGRESO' | 'EGRESO') => {
    const defaultCat = defaultType === 'INGRESO' ? 'Ingreso diario' : 'Compra';
    setFormData({
      date: getTodayDate(),
      type: defaultType,
      amount: '',
      category: defaultCat,
      concept: '',
      fund_source: 'CAJA',
      related_entity_type: 'OTRO',
      related_entity_id: '',
      notes: '',
    });
    setDuplicateWarning(null);
    setConfirmDuplicateProceed(false);
    setShowModal(true);
  };

  const handleCheckDuplicate = async () => {
    if (!currentWeek || !formData.amount || !formData.concept) return;
    const checkPayload = {
      week_id: currentWeek.id,
      date: formData.date,
      type: formData.type,
      amount: parseFloat(formData.amount),
      concept: formData.concept,
      category: formData.category,
      fund_source: formData.fund_source,
      related_entity_type: formData.related_entity_type === 'OTRO' ? null : formData.related_entity_type,
      related_entity_id: formData.related_entity_id ? Number(formData.related_entity_id) : null,
      user: userRole,
    };
    try {
      const res = await checkDuplicateMovement(checkPayload);
      if (res.has_potential_duplicate) {
        setDuplicateWarning(res.duplicates);
      } else {
        setDuplicateWarning(null);
      }
    } catch (e) {
      // Ignorar chequeo silencioso
    }
  };

  const handleSubmitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWeek) return;
    const amountNum = parseFloat(formData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Por favor ingrese un importe válido mayor a cero');
      return;
    }
    if (!formData.concept.trim()) {
      alert('Por favor ingrese un concepto descriptivo');
      return;
    }

    // Si hay advertencia de duplicado y no confirmó aún:
    if (duplicateWarning && !confirmDuplicateProceed) {
      setConfirmDuplicateProceed(true);
      return;
    }

    try {
      await createMovement({
        week_id: currentWeek.id,
        date: formData.date,
        type: formData.type,
        amount: amountNum,
        concept: formData.concept.trim(),
        category: formData.category,
        fund_source: formData.fund_source,
        related_entity_type: formData.related_entity_type === 'OTRO' ? null : formData.related_entity_type,
        related_entity_id: formData.related_entity_id ? Number(formData.related_entity_id) : null,
        notes: formData.notes,
        user: userRole,
      });
      setShowModal(false);
      onRefreshWeek();
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleConfirmCancel = async () => {
    if (!movementToCancel) return;
    if (!cancelReason.trim()) {
      alert('El motivo de anulación es obligatorio para conservar la auditoría (RF-01, RN-10)');
      return;
    }

    try {
      await cancelMovement(movementToCancel.id, {
        user: userRole,
        reason: cancelReason.trim(),
      });
      setCancelModalOpen(false);
      setMovementToCancel(null);
      setCancelReason('');
      onRefreshWeek();
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filtrado de movimientos
  const filteredMovements = movements.filter((m) => {
    if (filterType !== 'ALL' && m.type !== filterType) return false;
    if (filterCategory !== 'ALL' && m.category !== filterCategory) return false;
    if (filterFundSource !== 'ALL' && m.fund_source !== filterFundSource) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Barra superior con acciones de alta */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Libro Diario de Caja</h2>
          <p className="text-xs text-slate-500">
            Registro cronológico de ingresos, egresos, adelantos y gastos operativos
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleOpenModal('INGRESO')}
            disabled={currentWeek?.status === 'CLOSED'}
            className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>+ Ingreso</span>
          </button>
          <button
            onClick={() => handleOpenModal('EGRESO')}
            disabled={currentWeek?.status === 'CLOSED'}
            className="flex items-center space-x-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>- Egreso</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center space-x-1 text-slate-500 font-semibold mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros:</span>
        </div>

        <div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-700 font-medium focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">Todos los tipos</option>
            <option value="INGRESO">Solo Ingresos</option>
            <option value="EGRESO">Solo Egresos</option>
          </select>
        </div>

        <div>
          <select
            value={filterFundSource}
            onChange={(e) => setFilterFundSource(e.target.value)}
            className="border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-700 font-medium focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">Cualquier origen</option>
            <option value="CAJA">Solo Caja</option>
            <option value="FONDOS_EXTERNOS">Solo Fondos Externos</option>
          </select>
        </div>

        <div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-700 font-medium focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center space-x-1.5 ml-auto text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="rounded text-emerald-600 focus:ring-emerald-500"
          />
          <span>Mostrar anulados</span>
        </label>
      </div>

      {/* Tabla cronológica de movimientos (RF-01) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Concepto / Referencia</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4">Origen</th>
                <th className="py-3 px-4 text-right">Importe</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No hay movimientos registrados para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const isAnulado = m.is_cancelled === 1;
                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isAnulado ? 'bg-slate-50/40 opacity-60' : ''
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-medium">
                        {m.date}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            m.type === 'INGRESO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">
                          {isAnulado && <span className="text-rose-600 font-bold mr-1">[ANULADO]</span>}
                          {m.concept}
                        </div>
                        {m.employee_name && (
                          <div className="text-[11px] text-slate-500">
                            Empleado: <span className="font-medium text-slate-700">{m.employee_name}</span>
                          </div>
                        )}
                        {isAnulado && m.cancelled_reason && (
                          <div className="text-[10px] text-rose-600 italic mt-0.5">
                            Motivo anulación: {m.cancelled_reason} (por {m.cancelled_by || 'Admin'})
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px]">
                          {m.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.fund_source === 'CAJA'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {m.fund_source === 'CAJA' ? 'Caja Operativa' : 'Fondos Externos'}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right whitespace-nowrap font-bold text-sm ${
                          m.type === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'
                        } ${isAnulado ? 'line-through' : ''}`}
                      >
                        {m.type === 'INGRESO' ? '+' : '-'} {formatARS(m.amount)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {!isAnulado && (
                          <button
                            onClick={() => {
                              setMovementToCancel(m);
                              setCancelReason('');
                              setCancelModalOpen(true);
                            }}
                            disabled={currentWeek?.status === 'CLOSED'}
                            title="Anular movimiento conservando trazabilidad"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors disabled:opacity-30"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Alta de Movimiento */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Registrar {formData.type === 'INGRESO' ? 'Ingreso' : 'Egreso'} de Fondos
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Complete los datos del movimiento. Se validará contra duplicados (RF-01).
            </p>

            <form onSubmit={handleSubmitMovement} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-slate-700 font-semibold">Fecha</label>
                    <span className="text-[10px] text-emerald-600 font-medium">Predeterminada hoy (editable)</span>
                  </div>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Importe ($ ARS)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    onBlur={handleCheckDuplicate}
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Concepto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago a proveedor de insumos, Adelanto Ariel..."
                  value={formData.concept}
                  onChange={(e) => setFormData({ ...formData, concept: e.target.value })}
                  onBlur={handleCheckDuplicate}
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Categoría</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  >
                    {categories
                      .filter((c) => c.type === formData.type)
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Origen de Fondos</label>
                  <select
                    value={formData.fund_source}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fund_source: e.target.value as 'CAJA' | 'FONDOS_EXTERNOS',
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 font-semibold"
                  >
                    <option value="CAJA">Caja Operativa (Modifica saldo)</option>
                    <option value="FONDOS_EXTERNOS">Fondos Externos (No toca caja)</option>
                  </select>
                </div>
              </div>

              {/* Si es adelanto o pago, vincular empleado */}
              {(formData.category === 'Adelanto' || formData.category.includes('Pago')) && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Empleado Asociado
                  </label>
                  <select
                    value={formData.related_entity_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        related_entity_type: 'EMPLEADO',
                        related_entity_id: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Seleccione empleado...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} (Sueldo: {formatARS(emp.weekly_salary)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales opcionales..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Alerta de Duplicado (RF-01) */}
              {duplicateWarning && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-900 flex items-start space-x-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold">Advertencia de posible duplicado (RF-01)</h5>
                    <p className="text-[11px] mt-0.5">
                      Existe ya un movimiento en la misma fecha ({formData.date}) por importe de ${formData.amount}.
                    </p>
                    <p className="text-[11px] font-semibold mt-1">
                      ¿Confirma que desea registrar este movimiento duplicado?
                    </p>
                  </div>
                </div>
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
                  className={`px-4 py-2 rounded-lg text-white font-bold transition-colors ${
                    duplicateWarning && !confirmDuplicateProceed
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {duplicateWarning && !confirmDuplicateProceed ? 'Revisar / Continuar' : 'Guardar Movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Anulación con Motivo Obligatorio (RN-10) */}
      {cancelModalOpen && movementToCancel && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center space-x-2 text-rose-600 mb-2">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold">Anulación de Movimiento #{movementToCancel.id}</h3>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Por norma de consistencia y auditoría (RF-01, RN-10), la anulación no borra el registro físico y requiere motivo explícito.
            </p>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs mb-4">
              <div><strong>Concepto:</strong> {movementToCancel.concept}</div>
              <div><strong>Fecha:</strong> {movementToCancel.date}</div>
              <div><strong>Importe:</strong> {formatARS(movementToCancel.amount)} ({movementToCancel.type})</div>
            </div>

            <div className="space-y-2 mb-4 text-xs">
              <label className="block text-slate-700 font-semibold">
                Motivo de la anulación (Obligatorio)
              </label>
              <textarea
                rows={3}
                required
                placeholder="Indique claramente por qué se anula este movimiento..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-sm"
              >
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
