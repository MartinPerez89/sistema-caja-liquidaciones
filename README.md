# Sistema de Gestión de Caja y Liquidación Semanal de Personal

Sistema completo, estable y consistente desarrollado estrictamente a partir de la **Especificación Funcional Inicial (RF)** y las 10 **Reglas de Negocio (RN-01 a RN-10)**.

---

## 🚀 Puesta en Marcha Inmediata

El sistema está listo para ejecutarse en Windows. Incluye servidor web integrado con base de datos SQLite ACID (WAL mode) y aplicación SPA React/Tailwind ya compilada.

### Opción 1: Con Python (Un solo comando)
```powershell
python run_server.py
```
Luego abra en su navegador: **[http://localhost:8000](http://localhost:8000)**

### Opción 2: Con el script directo de Windows
Haga doble clic en `iniciar_sistema.bat` o ejecute en PowerShell:
```powershell
.\iniciar_sistema.ps1
```

---

## 📋 Cumplimiento de Requerimientos Funcionales

| Código | Requerimiento | Implementación en el Sistema |
|---|---|---|
| **RF-01** | **Registro de Movimientos de Caja** | Ingresos y egresos con fecha, importe, categoría, origen de fondos (Caja vs Fondos Externos), notas y alerta de posibles duplicados en tiempo real. |
| **RF-02** | **Cálculo y Consulta de Saldos** | Cálculo automático: `Saldo inicial + Ingresos Caja - Egresos Caja`. Distingue saldo en mano de saldo proyectado tras obligaciones salariales. |
| **RF-03** | **Administración de Empleados** | Fichas de Ariel ($160.000 / 5 días = $32.000/día) y Erica ($210.000 / 5 días = $42.000/día). Historial salarial con fecha de vigencia y motivo. |
| **RF-04** | **Asistencia y Feriados** | Grilla semanal interactiva Lunes a Viernes (Trabajado, Ausencia, Feriado no trabajado, Licencia, Otro). Descuento individual por día no trabajado. |
| **RF-05** | **Adelantos de Sueldo** | Los adelantos entregados desde caja impactan en la fecha de entrega y se descuentan de la liquidación semanal sin duplicar egresos. |
| **RF-06** | **Cobertura de Turnos** | Regla configurable: si Ariel cubre a Erica por ausencia, se descuentan $42.000 a Erica y se agregan $38.500 a Ariel por jornada cubierta. |
| **RF-07** | **Cálculo de Liquidaciones** | Desglose transparente individual (Base, Inasistencias, Coberturas, Adelantos, Deuda previa, Neto, Pagos, Saldo restante). **Línea conjunta Ariel & Erica** con botón de copia rápida. |
| **RF-08** | **Pagos Totales y Parciales** | Pagos desde **Caja** (generan egreso físico) o **Fondos Externos** (cancelan deuda sin alterar la caja). Prevención de doble imputación. |
| **RF-09** | **Diferencias entre Semanas** | Importes no abonados se trasladan automáticamente a la siguiente semana como saldo pendiente adeudado. |
| **RF-10** | **Extracciones y Cierre** | Extracciones parciales o totales (dejan saldo en $0,00). Cierre semanal con traslado de saldo a la nueva semana y auditoría de reaperturas. |
| **RF-11** | **Historial y Auditoría** | Bitácora inmutable con usuario, timestamp, acción, datos anteriores, datos nuevos y motivo obligatorio. |
| **RF-12** | **Reportes y Exportaciones** | Exportación nativa a **Excel (.xlsx)** y vista optimizada para impresión o **guardar como PDF**. |
| **RF-13** | **Roles y Permisos** | Selector de rol **Administrador** / **Operador** en la barra superior. |

---

## 🔒 Regla Central de Consistencia (RN-08)
> **"Solo los movimientos cuyo origen de fondos sea la caja deben modificar el saldo de caja. Un pago realizado con otros fondos puede cancelar una deuda salarial, pero no debe registrarse como egreso de caja."**

El sistema separa estrictamente:
- **Movimientos de Caja (`CAJA`)**: Modifican el efectivo físico en gaveta/caja registradora.
- **Movimientos Externos (`FONDOS_EXTERNOS`)**: Registran cancelaciones de deudas salariales u operaciones realizadas con fondos externos (transferencias bancarias, billeteras o cuentas personales) sin afectar el saldo de caja física.

---

## 🧪 Pruebas Unitarias Automatizadas

El sistema cuenta con una suite de pruebas que valida matemáticamente todas las reglas de negocio (RN-01 a RN-10):
```powershell
python -m unittest backend.tests.test_business_rules
```
Resultado: **7 de 7 pruebas aprobadas (100% éxito)**.
