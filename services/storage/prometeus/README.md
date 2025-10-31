# Prometheus - Hot Storage

## 🎯 Propósito

Almacenamiento de métricas en tiempo real con **retención de 30 días**. Prometheus scrapea las métricas expuestas por el Collector cada 15 segundos.

---

## � Uso

### 1. Levantar el Collector (requerido)

```powershell
cd ..\..\collector
docker compose up -d
```

> **💡 Nota**: Verifica opcionalmente el health check en http://localhost:13133/health

### 2. Levantar Prometheus

```powershell
cd ..\storage\prometeus
docker compose up -d
```

### 3. Acceder a Prometheus

- **UI**: http://localhost:9090
- **Targets**: http://localhost:9090/targets (verifica que "otel-collector-metrics" esté UP)

---

## � Verificar Métricas

### Ejecutar el test para generar datos:

```powershell
cd ..\..\collector\tests
.\.venv\Scripts\python.exe test_collector.py
```

### Ver métricas en Prometheus:

```promql
# CPU
customer_monitoring_system_cpu_percent

# RAM
customer_monitoring_system_memory_percent
```

---

## 🔧 Configuración

- **Retención**: 30 días o 50GB (en `docker-compose.yml`)
- **Scrape**: Cada 15 segundos desde `localhost:8889/metrics` (en `prometheus.yml`)
- **Storage**: Volumen persistente `prometheus-hot-storage`

---

## 📖 Troubleshooting

**Target DOWN**: Verifica que el Collector esté corriendo (`docker ps`) y que `http://localhost:8889/metrics` responda.

**Sin métricas**: Ejecuta el test y espera 15 segundos para que Prometheus scrapeé los datos.

