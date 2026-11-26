import os
import uvicorn

if __name__ == "__main__":
    # Railway inyecta dinámicamente la variable PORT en el entorno
    raw_port = os.environ.get("PORT", "8000")
    try:
        port = int(raw_port)
    except (ValueError, TypeError):
        port = 8000

    print(f"Iniciando Uvicorn en 0.0.0.0:{port}...")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
