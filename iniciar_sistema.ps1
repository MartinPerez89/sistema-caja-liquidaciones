Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Iniciando Sistema de Caja y Liquidación Semanal (RF-01..13)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

Start-Process "http://localhost:8000"
python run_server.py
