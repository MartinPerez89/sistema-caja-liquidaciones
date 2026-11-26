import React, { useState, useEffect } from 'react';
import { Week, CashExtraction } from '../types';
import {
  closeWeek,
  reopenWeek,
  getWeekExtractions,
  createExtraction,
  formatARS,
  getTodayDate
} from '../api';
import {
  Lock,
  Unlock,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Clock,
  ShieldCheck,
  Send,
  HelpCircle
} from 'lucide-react';

interface ClosureViewProps {
  currentWeek: Week | null;
  userRole: 'Administrador' | 'Operador';
  onRefreshWeek: () => void;
  onSelectWeek: (id: number) => void;
}

export const ClosureView: React.FC<ClosureViewProps> = ({
  currentWeek,
  userRole,
  onRefreshWeek,
  onSelectWeek,
}) => {
  const [extractions, setExtractions] = useState<CashExtraction[]>([]);
  const [loading, setLoading] = useState(false);

  // Extracción
  const [showExtractionModal, setShowExtractionModal] = useState(false);
  const [extractionForm, setExtractionForm] = useState({
    date: getTodayDate(),
    extraction_type: 'PARCIAL' as 'PARCIAL' | 'TOTAL',
    amount: '',
    destination: 'Dueño / Retiro de utilidades',
    notes: '',
  });

  // Reapertura
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const loadExtractions = async () => {
    if (!currentWeek) return;
    setLoading(true);
    try {
      const data = await getWeekExtractions(currentWeek.id);
      setExtractions(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExtractions();
  }, [currentWeek]);

  const balance = currentWeek?.balance || {
    initial_cash: 0,
    total_incomes: 0,
    total_expenses: 0,
    current_cash: 0,
    pending_salary_obligations: 0,
    projected_cash: 0,
  };

  const isClosed = currentWeek?.status === 'CLOSED';

  const handleOpenExtraction = (type: 'PARCIAL' | 'TOTAL') => {
    setExtractionForm({
      date: getTodayDate(),
      extraction_type: type,
      amount: type === 'TOTAL' ? balance.current_cash.toString() : '',
      destination: 'Retiro de utilidades / Caja fuerte',
      notes: type === 'TOTAL' ? 'Extracción total de saldo semanal' : '',
    });
    setShowExtractionModal(true);
  };

  const handleSubmitExtraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWeek) return;

    const amountNum = parseFloat(extractionForm.amount);
    if (extractionForm.extraction_type === 'PARCIAL' && (isNaN(amountNum) || amountNum <= 0)) {
      alert('Ingrese un importe válido para la extracción parcial');
      return;
    }

    try {
      await createExtraction({
        week_id: currentWeek.id,
        date: extractionForm.date,
        extraction_type: extractionForm.extraction_type,
        amount: extractionForm.extraction_type === 'TOTAL' ? balance.current_cash : amountNum,
        destination: extractionForm.destination.trim(),
        notes: extractionForm.notes,
        user: userRole,
      });

      setShowExtractionModal(false);
      onRefreshWeek();
      loadExtractions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCloseWeek = async () => {
    if (!currentWeek) return;
    if (
      !confirm(
        `¿Confirma el cierre definitivo de la semana ${currentWeek.week_code}? El saldo final calculado (${formatARS(
          balance.current_cash
        )}) será propuesto como saldo inicial de la próxima semana.`
      )
    ) {
      return;
    }

    try {
      const res = await closeWeek(currentWeek.id, {
        user: userRole,
        notes: `Cierre semanal con saldo final: ${balance.current_cash}`,
      });
      alert(
        `Semana cerrada exitosamente.\n\nSiguiente semana generada: ${res.next_week_code}\nSaldo inicial trasladado: ${formatARS(
          res.next_initial_cash
        )}`
      );
      onRefreshWeek();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReopenWeek = async () => {
    if (!currentWeek) return;
    if (!reopenReason.trim()) {
      alert('Debe ingresar un motivo obligatorio para reabrir la semana (RF-10, RN-10).');
      return;
    }

    try {
      await reopenWeek(currentWeek.id, {
        user: userRole,
        reason: reopenReason.trim(),
      });
      setShowReopenModal(false);
      setReopenReason('');
      onRefreshWeek();
      alert('Semana reabierta con éxito y registrada en la auditoría.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Cierre de Semana Operativa (RF-10, RN-03)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Conciliación final de caja, extracciones y traslado de saldo inicial a la semana siguiente.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {!isClosed ? (
            <button
              onClick={handleCloseWeek}
              className="flex items-center space-x-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Cerrar Semana y Trasladar Saldo</span>
            </button>
          ) : (
            <button
              onClick={() => setShowReopenModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Reabrir Semana (Autorizada)</span>
            </button>
          )}
        </div>
      </div>

      {/* Tarjeta de Conciliación de Caja */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 transition-colors">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
          Conciliación Final de Caja
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold block uppercase">Saldo Inicial</span>
            <span className="text-xl font-bold text-slate-900 dark:text-white mt-1 block">
              {formatARS(balance.initial_cash)}
            </span>
          </div>

          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
            <span className="text-emerald-700 dark:text-emerald-400 text-xs font-semibold block uppercase">(+) Ingresos de Caja</span>
            <span className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mt-1 block">
              +{formatARS(balance.total_incomes)}
            </span>
          </div>

          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800/50">
            <span className="text-rose-700 dark:text-rose-400 text-xs font-semibold block uppercase">(-) Egresos de Caja</span>
            <span className="text-xl font-bold text-rose-800 dark:text-rose-300 mt-1 block">
              -{formatARS(balance.total_expenses)}
            </span>
          </div>

          <div className="p-4 bg-slate-900 dark:bg-slate-800 text-white rounded-xl shadow-md border border-slate-800 dark:border-slate-700">
            <span className="text-emerald-400 text-xs font-semibold block uppercase">(=) Saldo Final en Mano</span>
            <span className="text-2xl font-black mt-1 block">
              {formatARS(balance.current_cash)}
            </span>
          </div>
        </div>

        {/* Explicación de la regla de traslado */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-lg text-xs text-blue-900 dark:text-blue-200 flex items-start space-x-2">
          <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <strong>Regla de negocio RN-03:</strong> Al cerrar la semana, el saldo final (${formatARS(balance.current_cash)}) se traslada como saldo inicial de la siguiente semana (Lunes a Viernes), salvo que se registre una <em>extracción total</em> antes del cierre, en cuyo caso la siguiente semana iniciará en $0,00.
          </div>
        </div>
      </div>

      {/* Sección Extracciones de Caja (RF-10) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Extracciones de Caja (RF-10)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Retiro de efectivo físico parcial o vaciado total antes del cierre.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleOpenExtraction('PARCIAL')}
              disabled={isClosed || balance.current_cash <= 0}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              Extracción Parcial
            </button>
            <button
              onClick={() => handleOpenExtraction('TOTAL')}
              disabled={isClosed || balance.current_cash <= 0}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shadow-sm cursor-pointer"
            >
              Extracción Total (Dejar en $0)
            </button>
          </div>
        </div>

        {extractions.length === 0 ? (
          <div className="text-xs text-slate-400 dark:text-slate-500 p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
            No se han registrado extracciones en esta semana operativa
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase font-semibold text-[10px]">
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Tipo de Extracción</th>
                  <th className="py-2.5 px-3">Destino</th>
                  <th className="py-2.5 px-3 text-right">Importe Extraído</th>
                  <th className="py-2.5 px-3">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {extractions.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">{ex.date}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          ex.extraction_type === 'TOTAL'
                            ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 dark:border dark:border-rose-800/40'
                            : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 dark:border dark:border-amber-800/40'
                        }`}
                      >
                        {ex.extraction_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">{ex.destination}</td>
                    <td className="py-2.5 px-3 text-right font-black text-rose-600 dark:text-rose-400 text-sm">
                      -{formatARS(ex.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{ex.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Extracción */}
      {showExtractionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Registrar Extracción {extractionForm.extraction_type === 'TOTAL' ? 'Total' : 'Parcial'} de Caja
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {extractionForm.extraction_type === 'TOTAL'
                ? 'La extracción total retirará todo el efectivo restante ($' + formatARS(balance.current_cash) + ') dejando la caja en cero.'
                : 'Indique el importe a retirar de la caja.'}
            </p>

            <form onSubmit={handleSubmitExtraction} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={extractionForm.date}
                    onChange={(e) => setExtractionForm({ ...extractionForm, date: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Importe ($ ARS)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    disabled={extractionForm.extraction_type === 'TOTAL'}
                    value={extractionForm.amount}
                    onChange={(e) => setExtractionForm({ ...extractionForm, amount: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg p-2 font-bold focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 dark:disabled:bg-slate-800/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Destino de los fondos</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Retiro dueño, Depósito bancario, Caja de seguridad..."
                  value={extractionForm.destination}
                  onChange={(e) => setExtractionForm({ ...extractionForm, destination: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Observaciones</label>
                <input
                  type="text"
                  placeholder="Detalles adicionales..."
                  value={extractionForm.notes}
                  onChange={(e) => setExtractionForm({ ...extractionForm, notes: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowExtractionModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  Confirmar Extracción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reapertura de Semana */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 mb-1">Reapertura de Semana Cerrada</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Por norma de control y auditoría (RF-10, RN-10), la reapertura de una semana cerrada requiere motivo y quedará asentada en la bitácora.
            </p>

            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Motivo de la reapertura (Obligatorio)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Indique claramente por qué se reabre esta semana ya cerrada..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg p-2 focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleReopenWeek}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-sm cursor-pointer"
              >
                Confirmar Reapertura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
