from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .database import init_db
from .routes import (
    weeks,
    movements,
    employees,
    attendance,
    coverages,
    liquidations,
    payments,
    extractions,
    audit,
    reports,
    settings
)

app = FastAPI(
    title="Sistema de Gestión de Caja y Liquidación Semanal",
    version="1.0.0",
    description="Sistema consistente y estable conforme a especificación funcional inicial de requerimientos (RF-01 a RF-13 y RN-01 a RN-10)."
)

# Configuración de CORS con Vercel y entornos locales
allowed_origins = [
    "https://sistema-caja-liquidaciones.vercel.app",
    "https://sistema-caja-liquidaciones.vercel.app/",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

extra_origins = os.getenv("ALLOWED_ORIGINS")
if extra_origins:
    allowed_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar Base de Datos SQLite con WAL y datos de arranque
@app.on_event("startup")
def startup_event():
    init_db()

# Incluir Rutas de API
app.include_router(weeks.router)
app.include_router(movements.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(coverages.router)
app.include_router(liquidations.router)
app.include_router(payments.router)
app.include_router(extractions.router)
app.include_router(audit.router)
app.include_router(reports.router)
app.include_router(settings.router)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "system": "Sistema de gestión de caja y liquidación semanal",
        "version": "1.0.0"
    }

# Servir frontend estático si está compilado
dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
