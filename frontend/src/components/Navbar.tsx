import React from 'react';
import { Week } from '../types';
import { formatARS } from '../api';
import {
  LayoutDashboard,
  Wallet,
  CalendarCheck,
  Users,
  Calculator,
  CreditCard,
  Lock,
  FileSpreadsheet,
  ShieldCheck,
  AlertCircle,
  Sun,
  Moon
} from 'lucide-react';

interface NavbarProps {
  currentWeek: Week | null;
  weeks: Week[];
  selectedWeekId: number | null;
  onSelectWeek: (id: number) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  userRole: 'Administrador' | 'Operador';
  onToggleRole: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentWeek,
  weeks,
  selectedWeekId,
  onSelectWeek,
  activeTab,
  onSelectTab,
  userRole,
  onToggleRole,
  theme,
  onToggleTheme,
}) => {
  const currentCash = currentWeek?.balance?.current_cash ?? 0;
  const isClosed = currentWeek?.status === 'CLOSED';

  const navItems = [
    { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
    { id: 'caja', label: 'Caja Diaria', icon: Wallet },
    { id: 'asistencia', label: 'Asistencia', icon: CalendarCheck },
    { id: 'personal', label: 'Personal', icon: Users },
    { id: 'liquidacion', label: 'Liquidación', icon: Calculator },
    { id: 'pagos', label: 'Pagos', icon: CreditCard },
    { id: 'cierre', label: 'Cierre', icon: Lock },
    { id: 'reportes', label: 'Reportes y Auditoría', icon: FileSpreadsheet },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50 shadow-md no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo y título */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-xl shadow-inner">
              $
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white leading-tight">
                Caja & Liquidaciones
              </h1>
              <p className="text-xs text-slate-400">Control operativo semanal (Lunes a Viernes)</p>
            </div>
          </div>

          {/* Selector de semana y estado */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
              <span className="text-xs text-slate-400 px-2 font-medium">Semana:</span>
              <select
                aria-label="Seleccionar semana operativa"
                value={selectedWeekId || ''}
                onChange={(e) => onSelectWeek(Number(e.target.value))}
                className="bg-slate-900 text-white text-xs font-semibold rounded px-2.5 py-1 border-0 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.week_code} ({w.start_date.slice(5)} al {w.end_date.slice(5)}) - {w.status === 'OPEN' ? '🟢 Abierta' : '🔒 Cerrada'}
                  </option>
                ))}
              </select>
            </div>

            {/* Saldo en efectivo badge */}
            <div className="hidden sm:flex items-center px-3 py-1 bg-emerald-950/60 border border-emerald-500/30 rounded-lg">
              <div className="text-right">
                <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Saldo en Caja</div>
                <div className="text-sm font-bold text-emerald-200">
                  {formatARS(currentCash)}
                </div>
              </div>
            </div>

            {/* Rol de usuario con switch */}
            <button
              onClick={onToggleRole}
              title="Clic para cambiar de rol (Administrador / Operador)"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                userRole === 'Administrador'
                  ? 'bg-purple-950/50 border-purple-500/40 text-purple-300 hover:bg-purple-900/50'
                  : 'bg-blue-950/50 border-blue-500/40 text-blue-300 hover:bg-blue-900/50'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{userRole}</span>
            </button>

            {/* Switch de Tema Claro / Oscuro (por defecto OSCURO) */}
            <button
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Cambiar a Tema Claro' : 'Cambiar a Tema Oscuro'}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 hover:text-white transition-all cursor-pointer shadow-xs"
            >
              {theme === 'dark' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden md:inline text-[11px] font-medium">Oscuro</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline text-[11px] font-medium">Claro</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Barra de navegación de vistas */}
        <nav className="flex space-x-1 overflow-x-auto py-2 border-t border-slate-800/80 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {isClosed && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs text-amber-300 flex items-center justify-center space-x-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>Esta semana operativa está <strong>CERRADA</strong>. Para realizar modificaciones se requiere reapertura autorizada.</span>
        </div>
      )}
    </header>
  );
};
