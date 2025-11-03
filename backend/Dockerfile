# 1. Usamos una imagen base oficial de Python
FROM python:3.10-slim

# 2. Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiamos el archivo de requerimientos PRIMERO
# (Esto aprovecha el caché de Docker)
COPY requirements.txt .

# 4. Instalamos las dependencias
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copiamos el resto del código de la aplicación
COPY . .

# 6. Exponemos el puerto en el que corre Flask
EXPOSE 5000

# 7. El comando para arrancar la aplicación
CMD [ "python", "./app.py" ]