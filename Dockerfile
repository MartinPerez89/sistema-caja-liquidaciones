FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar todo el código de la aplicación
COPY . .

# Variables de entorno por defecto
ENV PORT=8000
EXPOSE 8000

# Iniciar servidor backend con binding a 0.0.0.0
CMD ["python", "run_server.py"]
