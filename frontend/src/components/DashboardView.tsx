import React from 'react';
import { Week } from '../types';
import { formatARS } from '../api';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Clock,
  DollarSign
} from 'lucide-react';

interface DashboardViewProps {
  currentWeek: Week | null;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ currentWeek, onNavigate }) => {
  const balance = currentWeek?.balance || {
    initial_cash: 0,
    total_incomes: 0,
    total_expenses: 0,
    current_cash: 0,
    pending_salary_obligations: 0,
    projected_cash: 0,
  };

  const isLowCash = balance.current_cash < balance.pending_salary_obligations;

  return (
    <div className="space-y-6">
      {/* Banner de regla central y estado */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-xl p-5 text-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Semana Operativa {currentWeek?.week_code}
            </span>
            <span className="text-xs text-slate-300">
              ({currentWeek?.start_date} al {currentWeek?.end_date})
            </span>
          </div>
          <h2 className="text-xl font-extrabold mt-1 text-white">Panel de Control Financiero</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Período operativo de 5 días (Lunes a Viernes). Trazabilidad garantizada según requerimientos funcionales.
          </p>
        </div>

        {/* Badge de regla central */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-3 max-w-md text-xs text-slate-300">
          <div className="flex items-center space-x-1.5 text-amber-400 font-semibold mb-1">
            <HelpCircle className="w-4 h-4" />
            <span>Regla Central de Consistencia</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Solo los movimientos con origen <strong>CAJA</strong> afectan el efectivo. Los pagos con fondos externos saldan deuda salarial sin tocar la caja.
          </p>
        </div>
      </div>

      {/* Tarjetas KPI de Caja (RF-02) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo Actual */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Saldo Actual en Caja</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {formatARS(balance.current_cash)}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Saldo inicial: {formatARS(balance.initial_cash)}
              </p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg text-emerald-600 dark:text-emerald-400">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Disponible físico</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Auditado</span>
          </div>
        </div>

        {/* Total Ingresos */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ingresos de la Semana</p>
              <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {formatARS(balance.total_incomes)}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Acreditados en caja</p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Ventas / Cobros</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">Ver movimientos</span>
          </div>
        </div>

        {/* Total Egresos */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Egresos de la Semana</p>
              <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {formatARS(balance.total_expenses)}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Adelantos, pagos y gastos</p>
            </div>
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 rounded-lg text-rose-600 dark:text-rose-400">
              <TrendingDown className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Salidas de efectivo</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">Ver detalle</span>
          </div>
        </div>

        {/* Saldo Proyectado / Obligaciones Pendientes */}
        <div className={`bg-white dark:bg-slate-900 rounded-xl p-5 border shadow-sm relative overflow-hidden ${
          isLowCash ? 'border-amber-300 dark:border-amber-700 ring-1 ring-amber-200 dark:ring-amber-800/40' : 'border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Saldo Proyectado</p>
              <h3 className={`text-2xl font-black mt-1 ${isLowCash ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                {formatARS(balance.projected_cash)}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Sueldos pendientes: {formatARS(balance.pending_salary_obligations)}
              </p>
            </div>
            <div className={`p-2.5 rounded-lg ${isLowCash ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400' : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'}`}>
              {isLowCash ? <AlertTriangle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Luego de liquidar sueldos</span>
            <span className={`font-semibold ${isLowCash ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}>
              {isLowCash ? 'Atención' : 'Cubierto'}
            </span>
          </div>
        </div>
      </div>

      {/* Alerta contextual si hay obligaciones salariales no cubiertas */}
      {isLowCash && balance.pending_salary_obligations > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4 flex items-start space-x-3 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-bold">Advertencia de saldo disponible (RF-02)</h4>
            <p className="mt-0.5">
              El efectivo en caja ({formatARS(balance.current_cash)}) es menor que las obligaciones salariales pendientes de la semana ({formatARS(balance.pending_salary_obligations)}).
              Puede optar por pagar con fondos externos (ej. transferencia bancaria directa) o esperar nuevos ingresos antes de pagar desde caja.
            </p>
          </div>
        </div>
      )}

      {/* Accesos rápidos a operaciones frecuentes (V-01) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4">
          Operaciones Frecuentes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigate('caja')}
            className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-slate-800/80 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Caja Diaria</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Cargar ingresos / egresos</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </button>

          <button
            onClick={() => onNavigate('asistencia')}
            className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-slate-800/80 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-md bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Asistencia Semanal</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Grilla L-V y descuentos</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </button>

          <button
            onClick={() => onNavigate('liquidacion')}
            className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50/40 dark:hover:bg-slate-800/80 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-md bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Liquidación Semanal</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Desglose Ariel & Erica</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
          </button>

          <button
            onClick={() => onNavigate('cierre')}
            className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-amber-500 dark:hover:border-amber-500 hover:bg-amber-50/40 dark:hover:bg-slate-800/80 transition-all text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Cierre de Caja</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Extracciones y traslado</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
          </button>
        </div>
      </div>
    </div>
  );
};
