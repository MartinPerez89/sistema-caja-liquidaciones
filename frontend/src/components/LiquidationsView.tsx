import React, { useState, useEffect } from 'react';
import { Week, Liquidation, JointLine } from '../types';
import {
  getWeekLiquidations,
  confirmLiquidation,
  formatARS
} from '../api';
import {
  Calculator,
  CheckCircle2,
  Copy,
  DollarSign,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';

interface LiquidationsViewProps {
  currentWeek: Week | null;
  userRole: 'Administrador' | 'Operador';
  onRefreshWeek: () => void;
  onOpenPaymentModal: (liquidation: Liquidation) => void;
}

export const LiquidationsView: React.FC<LiquidationsViewProps> = ({
  currentWeek,
  userRole,
  onRefreshWeek,
  onOpenPaymentModal,
}) => {
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [jointLine, setJointLine] = useState<JointLine | null>(null);
  const [totals, setTotals] = useState({ net: 0, paid: 0, remaining: 0 });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadLiquidations = async () => {
    if (!currentWeek) return;
    setLoading(true);
    try {
      const data = await getWeekLiquidations(currentWeek.id);
      setLiquidations(data.liquidations);
      setJointLine(data.joint_line);
      setTotals({
        net: data.total_net_to_pay,
        paid: data.total_paid,
        remaining: data.total_remaining_debt,
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLiquidations();
  }, [currentWeek]);

  const handleConfirm = async (liq: Liquidation) => {
    if (!liq.liquidation_id) return;
    try {
      await confirmLiquidation(liq.liquidation_id, userRole);
      onRefreshWeek();
      loadLiquidations();
      alert(`Liquidación de ${liq.employee_name} confirmada.`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCopyJointLine = () => {
    if (!jointLine) return;
    navigator.clipboard.writeText(jointLine.summary_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Liquidación Semanal de Personal (RF-07)</h2>
          <p className="text-xs text-slate-500">
            Cálculo individual desglosado, deducción de adelantos e inasistencias, y arrastre de saldos previos.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-right">
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total a Pagar Semana</span>
            <span className="text-sm font-black text-slate-900">{formatARS(totals.net)}</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-right">
            <span className="text-amber-700 block text-[10px] uppercase font-semibold">Pendiente de Pago</span>
            <span className="text-sm font-black text-amber-900">{formatARS(totals.remaining)}</span>
          </div>
        </div>
      </div>

      {/* Fila conjunta Ariel y Erica (RF-07) */}
      {jointLine && (
        <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-purple-950 rounded-xl p-4 text-white border border-purple-800/40 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-purple-300 bg-purple-900/60 px-2 py-0.5 rounded border border-purple-700/50">
                Fila Conjunta — Consulta Rápida Ariel & Erica (RF-07)
              </span>
              <div className="mt-2 text-sm font-semibold text-slate-100 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <strong>Ariel:</strong> Neto {formatARS(jointLine.ariel_net)} | Pagado {formatARS(jointLine.ariel_paid)} | Pendiente{' '}
                  <span className={jointLine.ariel_remaining > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                    {formatARS(jointLine.ariel_remaining)}
                  </span>
                </span>
                <span className="text-purple-400">|</span>
                <span>
                  <strong>Erica:</strong> Neto {formatARS(jointLine.erica_net)} | Pagado {formatARS(jointLine.erica_paid)} | Pendiente{' '}
                  <span className={jointLine.erica_remaining > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                    {formatARS(jointLine.erica_remaining)}
                  </span>
                </span>
                <span className="text-purple-400">|</span>
                <span className="text-purple-200">
                  <strong>Total Conjunto:</strong> {formatARS(jointLine.combined_net)}
                </span>
              </div>
            </div>

            <button
              onClick={handleCopyJointLine}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-800 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '¡Copiado!' : 'Copiar Resumen'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tarjetas individuales desglosadas por empleado (RF-07) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {liquidations.map((liq) => {
          const isPaidTotal = liq.status === 'PAGADA_TOTAL';
          const isPending = liq.remaining_debt > 0;

          return (
            <div
              key={liq.employee_id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between space-y-5"
            >
              <div>
                {/* Cabecera del empleado */}
                <div className="flex justify-between items-start pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">{liq.employee_name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Valor diario: {formatARS(liq.daily_value)} (Base: {formatARS(liq.base_salary)} / sem.)
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      liq.status === 'PAGADA_TOTAL'
                        ? 'bg-emerald-100 text-emerald-800'
                        : liq.status === 'PAGADA_PARCIAL'
                        ? 'bg-amber-100 text-amber-800'
                        : liq.status === 'CONFIRMADA'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {liq.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Desglose matemático concepto por concepto */}
                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-700">
                    <span>Sueldo Base Semanal:</span>
                    <span className="font-semibold">{formatARS(liq.base_salary)}</span>
                  </div>

                  {liq.absent_discount_total > 0 && (
                    <div className="flex justify-between text-rose-600 font-medium">
                      <span>
                        (-) Días no trabajados ({liq.absent_days_count} {liq.absent_days_count === 1 ? 'día' : 'días'}):
                      </span>
                      <span>-{formatARS(liq.absent_discount_total)}</span>
                    </div>
                  )}

                  {liq.coverage_addition_total > 0 && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>(+) Adicionales por Cobertura de turnos:</span>
                      <span>+{formatARS(liq.coverage_addition_total)}</span>
                    </div>
                  )}

                  {liq.advances_total > 0 && (
                    <div className="flex justify-between text-rose-600 font-medium">
                      <span>(-) Adelantos tomados en la semana:</span>
                      <span>-{formatARS(liq.advances_total)}</span>
                    </div>
                  )}

                  {liq.previous_debt > 0 && (
                    <div className="flex justify-between text-purple-700 font-medium bg-purple-50 p-1.5 rounded">
                      <span>(+) Saldo adeudado de semanas previas (RN-09):</span>
                      <span className="font-bold">+{formatARS(liq.previous_debt)}</span>
                    </div>
                  )}

                  {/* Subtotal neto a pagar */}
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-sm font-extrabold text-slate-900">
                    <span>Total Neto a Pagar:</span>
                    <span className="text-base text-slate-900">{formatARS(liq.net_to_pay)}</span>
                  </div>

                  {/* Pagos realizados */}
                  <div className="flex justify-between items-center text-xs text-emerald-700 font-semibold bg-emerald-50/70 p-2 rounded-lg">
                    <span>(-) Pagos ya efectuados (Caja / Externos):</span>
                    <span>-{formatARS(liq.paid_amount)}</span>
                  </div>

                  {/* Saldo Restante Pendiente */}
                  <div className="flex justify-between items-center p-2.5 rounded-lg bg-slate-900 text-white font-black text-sm">
                    <span>Saldo Pendiente de Pago:</span>
                    <span className={liq.remaining_debt > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                      {formatARS(liq.remaining_debt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botonera de acciones */}
              <div className="flex items-center space-x-2 pt-3 border-t border-slate-100">
                {liq.status === 'BORRADOR' && (
                  <button
                    onClick={() => handleConfirm(liq)}
                    disabled={currentWeek?.status === 'CLOSED'}
                    className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 border border-blue-500 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirmar Liquidación</span>
                  </button>
                )}

                {isPending && (
                  <button
                    onClick={() => onOpenPaymentModal(liq)}
                    disabled={currentWeek?.status === 'CLOSED'}
                    className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Registrar Pago</span>
                  </button>
                )}

                {isPaidTotal && (
                  <div className="flex-1 text-center py-2 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg flex items-center justify-center space-x-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Liquidación Totalmente Saldada</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
