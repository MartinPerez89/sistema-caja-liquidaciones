import React, { useState, useEffect } from 'react';
import { Week, Payment, Liquidation } from '../types';
import {
  getPayments,
  createSalaryPayment,
  cancelPayment,
  getWeekLiquidations,
  formatARS,
  getTodayDate
} from '../api';
import {
  CreditCard,
  PlusCircle,
  Ban,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Wallet,
  DollarSign
} from 'lucide-react';

interface PaymentsViewProps {
  currentWeek: Week | null;
  userRole: 'Administrador' | 'Operador';
  onRefreshWeek: () => void;
  preselectedLiquidation?: Liquidation | null;
  onClearPreselectedLiquidation?: () => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  currentWeek,
  userRole,
  onRefreshWeek,
  preselectedLiquidation,
  onClearPreselectedLiquidation,
}) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal nuevo pago
  const [showModal, setShowModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    liquidation_id: '',
    date: getTodayDate(),
    amount: '',
    fund_source: 'CAJA' as 'CAJA' | 'FONDOS_EXTERNOS',
    notes: '',
  });

  // Modal anulación
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [paymentToCancel, setPaymentToCancel] = useState<Payment | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadData = async () => {
    if (!currentWeek) return;
    setLoading(true);
    try {
      const [pays, liqsData] = await Promise.all([
        getPayments(currentWeek.id),
        getWeekLiquidations(currentWeek.id),
      ]);
      setPayments(pays);
      setLiquidations(liqsData.liquidations);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentWeek]);

  // Si vino una liquidación preseleccionada desde la vista de liquidaciones
  useEffect(() => {
    if (preselectedLiquidation && preselectedLiquidation.liquidation_id) {
      setPaymentForm({
        liquidation_id: preselectedLiquidation.liquidation_id.toString(),
        date: getTodayDate(),
        amount: preselectedLiquidation.remaining_debt.toString(),
        fund_source: 'CAJA',
        notes: `Pago semanal - ${preselectedLiquidation.employee_name}`,
      });
      setShowModal(true);
      if (onClearPreselectedLiquidation) onClearPreselectedLiquidation();
    }
  }, [preselectedLiquidation]);

  const handleOpenNewPayment = () => {
    const defaultLiq = liquidations.find((l) => l.remaining_debt > 0);
    setPaymentForm({
      liquidation_id: defaultLiq?.liquidation_id?.toString() || '',
      date: getTodayDate(),
      amount: defaultLiq?.remaining_debt?.toString() || '',
      fund_source: 'CAJA',
      notes: defaultLiq ? `Pago a ${defaultLiq.employee_name}` : '',
    });
    setShowModal(true);
  };

  const handleSelectLiquidationChange = (liqIdStr: string) => {
    const selected = liquidations.find((l) => l.liquidation_id?.toString() === liqIdStr);
    setPaymentForm((prev) => ({
      ...prev,
      liquidation_id: liqIdStr,
      amount: selected ? selected.remaining_debt.toString() : '',
      notes: selected ? `Pago a ${selected.employee_name}` : '',
    }));
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(paymentForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Por favor ingrese un importe válido mayor a cero');
      return;
    }

    try {
      const res = await createSalaryPayment({
        liquidation_id: Number(paymentForm.liquidation_id),
        date: paymentForm.date,
        amount: amountNum,
        fund_source: paymentForm.fund_source,
        notes: paymentForm.notes,
        user: userRole,
      });

      if (res.warning) {
        alert(res.warning);
      }

      setShowModal(false);
      onRefreshWeek();
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleConfirmCancel = async () => {
    if (!paymentToCancel) return;
    if (!cancelReason.trim()) {
      alert('El motivo de anulación es obligatorio para conservar la auditoría (RF-08, RN-10)');
      return;
    }

    try {
      await cancelPayment(paymentToCancel.id, {
        user: userRole,
        reason: cancelReason.trim(),
      });
      setShowCancelModal(false);
      setPaymentToCancel(null);
      setCancelReason('');
      onRefreshWeek();
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const selectedLiq = liquidations.find((l) => l.liquidation_id?.toString() === paymentForm.liquidation_id);

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Registro de Pagos Salariales (RF-08)</h2>
          <p className="text-xs text-slate-500">
            Pagos totales o parciales con imputación por Caja u otros Fondos Externos (RN-08).
          </p>
        </div>

        <button
          onClick={handleOpenNewPayment}
          disabled={currentWeek?.status === 'CLOSED'}
          className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ Registrar Pago Salarial</span>
        </button>
      </div>

      {/* Explicación de consistencia de fondos (RN-08) */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start space-x-2">
        <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Regla Central & RN-08:</span> Si selecciona <strong>Caja Operativa</strong>, se genera un egreso que descuenta el efectivo disponible. Si selecciona <strong>Fondos Externos</strong> (transferencia bancaria propia, fondos personales), cancela la deuda salarial del empleado <em>sin modificar el saldo de caja</em>.
        </div>
      </div>

      {/* Tabla de pagos realizados */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Empleado</th>
                <th className="py-3 px-4">Origen de Fondos</th>
                <th className="py-3 px-4">Impacto en Caja</th>
                <th className="py-3 px-4 text-right">Importe Pagado</th>
                <th className="py-3 px-4">Notas / Auditoría</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No hay pagos salariales registrados en esta semana operativa
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const isAnulado = p.is_cancelled === 1;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isAnulado ? 'bg-slate-50/40 opacity-60' : ''
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-700">
                        {p.date}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {p.employee_name}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.fund_source === 'CAJA'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.fund_source === 'CAJA' ? 'Caja Operativa' : 'Fondos Externos'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[11px] font-semibold ${
                            p.fund_source === 'CAJA' ? 'text-rose-600' : 'text-slate-500'
                          }`}
                        >
                          {p.fund_source === 'CAJA'
                            ? `Egreso Mov #${p.movement_id}`
                            : 'Sin impacto en caja'}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right whitespace-nowrap font-extrabold text-sm ${
                          isAnulado ? 'line-through text-slate-400' : 'text-emerald-700'
                        }`}
                      >
                        {formatARS(p.amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {isAnulado ? (
                          <span className="text-rose-600 italic">
                            [ANULADO: {p.cancelled_reason}]
                          </span>
                        ) : (
                          p.notes || '-'
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {!isAnulado && (
                          <button
                            onClick={() => {
                              setPaymentToCancel(p);
                              setCancelReason('');
                              setShowCancelModal(true);
                            }}
                            disabled={currentWeek?.status === 'CLOSED'}
                            title="Anular pago conservando trazabilidad"
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

      {/* Modal Nuevo Pago */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Registrar Pago Salarial</h3>
            <p className="text-xs text-slate-500 mb-4">
              Imputa el pago a la liquidación del empleado (total o parcial).
            </p>

            <form onSubmit={handleSubmitPayment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Liquidación del Empleado
                </label>
                <select
                  required
                  value={paymentForm.liquidation_id}
                  onChange={(e) => handleSelectLiquidationChange(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="">Seleccione liquidación...</option>
                  {liquidations.map((l) => (
                    <option key={l.liquidation_id} value={l.liquidation_id}>
                      {l.employee_name} — Pendiente: {formatARS(l.remaining_debt)} (Neto: {formatARS(l.net_to_pay)})
                    </option>
                  ))}
                </select>
              </div>

              {selectedLiq && (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-700">
                  <div className="flex justify-between">
                    <span>Neto total calculado:</span>
                    <span className="font-bold">{formatARS(selectedLiq.net_to_pay)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ya abonado:</span>
                    <span className="font-semibold text-emerald-600">{formatARS(selectedLiq.paid_amount)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 text-slate-900">
                    <span className="font-bold">Saldo restante por pagar:</span>
                    <span className="font-black text-rose-600">{formatARS(selectedLiq.remaining_debt)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Fecha de pago</label>
                  <input
                    type="date"
                    required
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Importe a Pagar ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Origen de los Fondos (Regla Central & RN-08)
                </label>
                <select
                  value={paymentForm.fund_source}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      fund_source: e.target.value as 'CAJA' | 'FONDOS_EXTERNOS',
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  <option value="CAJA">Caja Operativa (Genera egreso de caja)</option>
                  <option value="FONDOS_EXTERNOS">
                    Fondos Externos (Bancos/Personales - NO altera caja)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Notas / Observaciones</label>
                <input
                  type="text"
                  placeholder="Detalles del recibo o transferencia..."
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

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
                  Confirmar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Anulación de Pago */}
      {showCancelModal && paymentToCancel && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-rose-600 mb-1">Anular Pago Salarial #{paymentToCancel.id}</h3>
            <p className="text-xs text-slate-500 mb-4">
              Se anulará el pago, se restituirá la deuda de la liquidación y, si fue pagado desde caja, se anulará también el egreso en caja.
            </p>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs mb-4">
              <div><strong>Empleado:</strong> {paymentToCancel.employee_name}</div>
              <div><strong>Fecha:</strong> {paymentToCancel.date}</div>
              <div><strong>Importe:</strong> {formatARS(paymentToCancel.amount)} ({paymentToCancel.fund_source})</div>
            </div>

            <div className="space-y-2 mb-4 text-xs">
              <label className="block text-slate-700 font-semibold">
                Motivo de anulación (Obligatorio para auditoría)
              </label>
              <textarea
                rows={3}
                required
                placeholder="Indique claramente la razón..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-sm"
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
