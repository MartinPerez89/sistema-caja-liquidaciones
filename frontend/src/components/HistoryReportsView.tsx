import React, { useState, useEffect } from 'react';
import { Week, AuditItem } from '../types';
import {
  getAuditTrail,
  getWeekById,
  formatARS
} from '../api';
import {
  FileSpreadsheet,
  Printer,
  History,
  ShieldCheck,
  Search,
  Filter,
  Eye,
  CheckCircle,
  Clock,
  Download
} from 'lucide-react';

interface HistoryReportsViewProps {
  currentWeek: Week | null;
  weeks: Week[];
  onSelectWeek: (id: number) => void;
}

export const HistoryReportsView: React.FC<HistoryReportsViewProps> = ({
  currentWeek,
  weeks,
  onSelectWeek,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'reporte' | 'auditoria'>('reporte');
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditItem | null>(null);

  // Filtros de auditoría
  const [auditEntityFilter, setAuditEntityFilter] = useState('ALL');
  const [auditUserFilter, setAuditUserFilter] = useState('ALL');

  const loadAudit = async () => {
    setLoadingAudit(true);
    try {
      const logs = await getAuditTrail(150);
      setAuditLogs(logs);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'auditoria') {
      loadAudit();
    }
  }, [activeSubTab]);

  const handleDownloadExcel = () => {
    if (!currentWeek) return;
    window.open(`/api/reports/excel/${currentWeek.id}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredLogs = auditLogs.filter((log) => {
    if (auditEntityFilter !== 'ALL' && log.entity_type !== auditEntityFilter) return false;
    if (auditUserFilter !== 'ALL' && log.user !== auditUserFilter) return false;
    return true;
  });

  const balance = currentWeek?.balance || {
    initial_cash: 0,
    total_incomes: 0,
    total_expenses: 0,
    current_cash: 0,
    pending_salary_obligations: 0,
    projected_cash: 0,
  };

  return (
    <div className="space-y-6">
      {/* Sub-navegación y botones de exportación */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm no-print">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSubTab('reporte')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'reporte'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Informe Semanal Completo
          </button>
          <button
            onClick={() => setActiveSubTab('auditoria')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'auditoria'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Bitácora de Auditoría (RF-11)
          </button>
        </div>

        {activeSubTab === 'reporte' && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadExcel}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar a Excel (.xlsx)</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* PESTAÑA 1: INFORME SEMANAL COMPLETO */}
      {activeSubTab === 'reporte' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 printable-area">
          {/* Encabezado del Reporte */}
          <div className="border-b border-slate-200 pb-5 flex justify-between items-start">
            <div>
              <span className="text-xs uppercase tracking-widest font-extrabold text-emerald-700 block">
                SISTEMA DE GESTIÓN DE CAJA Y LIQUIDACIÓN SEMANAL
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-1">
                Reporte de Cierre y Liquidaciones — Semana {currentWeek?.week_code}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Período: {currentWeek?.start_date} al {currentWeek?.end_date} (Lunes a Viernes) | Estado:{' '}
                <strong>{currentWeek?.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}</strong>
              </p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <div>Generado conforme a especificación RF</div>
              <div className="font-semibold text-slate-600 mt-0.5">Moneda: ARS ($)</div>
            </div>
          </div>

          {/* Resumen de Caja */}
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              1. Balance y Flujo de Efectivo en Caja
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-500 block">Saldo Inicial</span>
                <span className="text-base font-bold text-slate-900 mt-0.5 block">
                  {formatARS(balance.initial_cash)}
                </span>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-emerald-700 block">Total Ingresos</span>
                <span className="text-base font-bold text-emerald-800 mt-0.5 block">
                  +{formatARS(balance.total_incomes)}
                </span>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                <span className="text-rose-700 block">Total Egresos</span>
                <span className="text-base font-bold text-rose-800 mt-0.5 block">
                  -{formatARS(balance.total_expenses)}
                </span>
              </div>
              <div className="p-3 bg-slate-900 text-white rounded-lg">
                <span className="text-emerald-400 block font-semibold">Saldo Final en Mano</span>
                <span className="text-base font-black mt-0.5 block">
                  {formatARS(balance.current_cash)}
                </span>
              </div>
            </div>
          </div>

          {/* Nota de consistencia */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
            <strong>Criterio de consistencia aplicado:</strong> Todos los cálculos fueron auditados bajo las reglas de negocio RN-01 a RN-10. Los pagos realizados con fondos externos cancelaron deudas salariales sin afectar el saldo de caja física.
          </div>
        </div>
      )}

      {/* PESTAÑA 2: BITÁCORA DE AUDITORÍA (RF-11, RN-10) */}
      {activeSubTab === 'auditoria' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center space-x-1 font-semibold text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Filtros de Auditoría:</span>
            </div>

            <div>
              <select
                value={auditEntityFilter}
                onChange={(e) => setAuditEntityFilter(e.target.value)}
                className="border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">Todas las entidades</option>
                <option value="movements">Movimientos de Caja</option>
                <option value="liquidations">Liquidaciones</option>
                <option value="salary_payments">Pagos Salariales</option>
                <option value="weeks">Semanas Operativas</option>
                <option value="employees">Personal</option>
                <option value="attendance">Asistencia</option>
                <option value="cash_extractions">Extracciones</option>
              </select>
            </div>

            <div>
              <select
                value={auditUserFilter}
                onChange={(e) => setAuditUserFilter(e.target.value)}
                className="border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">Todos los usuarios</option>
                <option value="Administrador">Administrador</option>
                <option value="Operador">Operador</option>
                <option value="SISTEMA">Sistema</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[10px]">
                    <th className="py-2.5 px-3">Fecha y Hora</th>
                    <th className="py-2.5 px-3">Usuario</th>
                    <th className="py-2.5 px-3">Acción</th>
                    <th className="py-2.5 px-3">Entidad</th>
                    <th className="py-2.5 px-3">Motivo / Descripción</th>
                    <th className="py-2.5 px-3 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No hay registros de auditoría para los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3 font-medium text-slate-600 whitespace-nowrap">
                          {log.timestamp}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{log.user}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.action.includes('CANCEL') || log.action.includes('DELETE')
                                ? 'bg-rose-100 text-rose-800'
                                : log.action.includes('UPDATE') || log.action.includes('REOPEN')
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">{log.entity_type}</td>
                        <td className="py-2.5 px-3 text-slate-700">{log.reason}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => setSelectedAuditLog(log)}
                            className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100"
                            title="Ver datos antes y después"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle de Auditoría */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Registro de Auditoría #{selectedAuditLog.id}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {selectedAuditLog.action} por {selectedAuditLog.user} ({selectedAuditLog.timestamp})
            </p>

            <div className="space-y-3 text-xs mb-4">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <strong>Motivo registrado:</strong> {selectedAuditLog.reason}
              </div>

              {selectedAuditLog.previous_data && (
                <div>
                  <span className="font-semibold text-rose-700 block mb-1">Dato Anterior:</span>
                  <pre className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] overflow-x-auto text-rose-900 font-mono">
                    {selectedAuditLog.previous_data}
                  </pre>
                </div>
              )}

              {selectedAuditLog.new_data && (
                <div>
                  <span className="font-semibold text-emerald-700 block mb-1">Dato Nuevo:</span>
                  <pre className="p-2 bg-emerald-50 border border-emerald-200 rounded text-[11px] overflow-x-auto text-emerald-900 font-mono">
                    {selectedAuditLog.new_data}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold"
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
