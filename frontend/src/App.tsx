import React, { useState, useEffect } from 'react';
import { Week, Liquidation } from './types';
import { getWeeks, getWeekById } from './api';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { CashRegisterView } from './components/CashRegisterView';
import { AttendanceView } from './components/AttendanceView';
import { EmployeesView } from './components/EmployeesView';
import { LiquidationsView } from './components/LiquidationsView';
import { PaymentsView } from './components/PaymentsView';
import { ClosureView } from './components/ClosureView';
import { HistoryReportsView } from './components/HistoryReportsView';

export function App() {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [currentWeek, setCurrentWeek] = useState<Week | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [userRole, setUserRole] = useState<'Administrador' | 'Operador'>('Administrador');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    return saved === 'light' ? 'light' : 'dark'; // Por defecto TEMA OSCURO
  });
  const [loading, setLoading] = useState<boolean>(true);

  // Sincronizar clase .dark en el documento raíz
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Puente para abrir modal de pagos desde liquidación
  const [preselectedLiqForPayment, setPreselectedLiqForPayment] = useState<Liquidation | null>(null);

  const loadWeeksData = async (preferredWeekId?: number) => {
    try {
      const allWeeks = await getWeeks();
      setWeeks(allWeeks);
      if (allWeeks.length > 0) {
        let targetId = preferredWeekId || selectedWeekId;
        if (!targetId || !allWeeks.some((w) => w.id === targetId)) {
          // Tomar la primera abierta o la más reciente
          const openWeek = allWeeks.find((w) => w.status === 'OPEN');
          targetId = openWeek ? openWeek.id : allWeeks[0].id;
        }
        setSelectedWeekId(targetId);
        const detailedWeek = await getWeekById(targetId);
        setCurrentWeek(detailedWeek);
      }
    } catch (err: any) {
      console.error('Error cargando semanas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeeksData();
  }, []);

  const handleSelectWeek = async (weekId: number) => {
    setSelectedWeekId(weekId);
    try {
      const detailedWeek = await getWeekById(weekId);
      setCurrentWeek(detailedWeek);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRefreshCurrentWeek = async () => {
    if (selectedWeekId) {
      loadWeeksData(selectedWeekId);
    } else {
      loadWeeksData();
    }
  };

  const handleToggleRole = () => {
    setUserRole((prev) => (prev === 'Administrador' ? 'Operador' : 'Administrador'));
  };

  const handleOpenPaymentFromLiquidation = (liq: Liquidation) => {
    setPreselectedLiqForPayment(liq);
    setActiveTab('pagos');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Cargando sistema de caja y liquidaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <Navbar
        currentWeek={currentWeek}
        weeks={weeks}
        selectedWeekId={selectedWeekId}
        onSelectWeek={handleSelectWeek}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        userRole={userRole}
        onToggleRole={handleToggleRole}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView currentWeek={currentWeek} onNavigate={setActiveTab} />
        )}
        {activeTab === 'caja' && (
          <CashRegisterView
            currentWeek={currentWeek}
            userRole={userRole}
            onRefreshWeek={handleRefreshCurrentWeek}
          />
        )}
        {activeTab === 'asistencia' && (
          <AttendanceView
            currentWeek={currentWeek}
            userRole={userRole}
            onRefreshWeek={handleRefreshCurrentWeek}
          />
        )}
        {activeTab === 'personal' && (
          <EmployeesView
            userRole={userRole}
            onRefreshWeek={handleRefreshCurrentWeek}
          />
        )}
        {activeTab === 'liquidacion' && (
          <LiquidationsView
            currentWeek={currentWeek}
            userRole={userRole}
            onRefreshWeek={handleRefreshCurrentWeek}
            onOpenPaymentModal={handleOpenPaymentFromLiquidation}
          />
        )}
        {activeTab === 'pagos' && (
          <PaymentsView
            currentWeek={currentWeek}
            userRole={userRole}
            onRefreshWeek={handleRefreshCurrentWeek}
            preselectedLiquidation={preselectedLiqForPayment}
            onClearPreselectedLiquidation={() => setPreselectedLiqForPayment(null)}
          />
        )}
        {activeTab === 'cierre' && (
          <ClosureView
            currentWeek={currentWeek}
            userRole={userRole}
            onRefreshWeek={handleRefreshCurrentWeek}
            onSelectWeek={handleSelectWeek}
          />
        )}
        {activeTab === 'reportes' && (
          <HistoryReportsView
            currentWeek={currentWeek}
            weeks={weeks}
            onSelectWeek={handleSelectWeek}
          />
        )}
      </main>
    </div>
  );
}

export default App;
