# Storage Layer - Arquitectura Híbrida

## Visión General

Este componente implementa una **arquitectura de almacenamiento híbrida** que combina Prometheus (hot storage) y Cassandra (cold storage) para optimizar el rendimiento de queries en tiempo real mientras mantiene capacidades de análisis histórico a largo plazo.

## Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────────┐
│                     INGESTA DE TELEMETRÍA                         │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Collector     │
                    │  (Dispatcher)   │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼────────┐        ┌──────▼───────┐
        │   HOT PATH     │        │  COLD PATH   │
        │  (Tiempo Real) │        │  (Histórico) │
        └───────┬────────┘        └──────┬───────┘
                │                        │
        ┌───────▼────────┐        ┌──────▼───────────┐
        │  PROMETHEUS    │        │   CASSANDRA      │
        │                │        │                  │
        │  - Retención:  │        │  - Retención:    │
        │    30 días     │        │    1-2 años      │
        │  - Queries:    │        │  - Queries:      │
        │    50-200ms    │        │    500-2000ms    │
        │  - Storage:    │        │  - Storage:      │
        │    In-Memory   │        │    Disk-based    │
        │    + SSD       │        │    Distributed   │
        └───────┬────────┘        └──────┬───────────┘
                │                        │
                └────────────┬───────────┘
                             │
                    ┌────────▼────────┐
                    │    GRAFANA      │
                    │  (Visualización)│
                    │                 │
                    │  Query Router:  │
                    │  < 30d → Prom   │
                    │  > 30d → Cass   │
                    └─────────────────┘
```

---

## 🔥 Hot Path: Prometheus (Tiempo Real)

### Propósito
Almacenamiento optimizado para **queries ultra-rápidas** de datos recientes, diseñado para dashboards en tiempo real y alertas inmediatas.

### Características

#### Ventajas
- ⚡ **Latencia ultra-baja**: 50-200ms por query
- 📊 **Optimizado para series temporales**: Compresión eficiente
- 🎯 **PromQL nativo**: Lenguaje de queries poderoso
- 🔔 **Alerting integrado**: Alertmanager built-in
- 📈 **Agregaciones rápidas**: Rate, sum, avg en milisegundos

#### Configuración de Retención

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

# Configuración de almacenamiento
storage:
  tsdb:
    path: /prometheus/data
    retention.time: 30d          # Retener solo 30 días
    retention.size: 100GB         # Límite de espacio
    wal-compression: true         # Comprimir WAL

# Recibir datos del Collector
remote_write:
  - url: "http://cassandra-adapter:9201/write"  # También escribir a Cassandra
    queue_config:
      capacity: 10000
      max_shards: 50
      min_shards: 1
      max_samples_per_send: 5000
      batch_send_deadline: 5s

scrape_configs:
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['collector:8889']
```

#### Casos de Uso
- ✅ Dashboards en tiempo real
- ✅ Alertas críticas (< 5 minutos)
- ✅ Troubleshooting activo
- ✅ Análisis de últimas 24-72 horas
- ✅ Queries ad-hoc frecuentes

#### Límites
- ❌ No apto para retención > 90 días (costo/espacio)
- ❌ Escalabilidad vertical limitada
- ❌ No distribuido (single point of failure)

---

## ❄️ Cold Path: Cassandra (Histórico)

### Propósito
Almacenamiento distribuido para **análisis histórico**, compliance, auditoría y retención a largo plazo con alta disponibilidad.

### Características

#### Ventajas
- 💾 **Retención masiva**: 1-2 años (o más) sin problema
- 🌐 **Distribuido**: Réplicas en múltiples nodos
- 📈 **Escalabilidad horizontal**: Agregar nodos según necesidad
- 🔒 **Durabilidad**: Sin pérdida de datos (replicación)
- ⚡ **Write-optimized**: Alto throughput de escrituras

#### Arquitectura del Cluster

```
┌─────────────────────────────────────────────────────┐
│           Cassandra Ring (Cluster)                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │  Node 1  │───▶│  Node 2  │───▶│  Node 3  │     │
│  │ (Primary)│    │ (Replica)│    │ (Replica)│     │
│  └──────────┘    └──────────┘    └──────────┘     │
│       ▲                                   │         │
│       └───────────────────────────────────┘         │
│                  Replication Factor: 3              │
└─────────────────────────────────────────────────────┘
```

#### Esquema de Base de Datos

```cql
-- Keyspace para telemetría
CREATE KEYSPACE IF NOT EXISTS observability 
WITH replication = {
    'class': 'NetworkTopologyStrategy',
    'datacenter1': 3  -- 3 réplicas
};

-- Tabla para métricas (wide-column model)
CREATE TABLE observability.metrics (
    customer_id text,
    node_id text,
    metric_name text,
    timestamp timestamp,
    value double,
    labels map<text, text>,
    PRIMARY KEY ((customer_id, node_id, metric_name), timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC)
  AND compaction = {
      'class': 'TimeWindowCompactionStrategy',
      'compaction_window_size': 1,
      'compaction_window_unit': 'DAYS'
  }
  AND default_time_to_live = 63072000;  -- 2 años en segundos

-- Índice secundario para queries por customer
CREATE INDEX IF NOT EXISTS idx_customer 
ON observability.metrics (customer_id);

-- Tabla para trazas (traces)
CREATE TABLE observability.traces (
    trace_id text,
    span_id text,
    timestamp timestamp,
    customer_id text,
    service_name text,
    operation_name text,
    duration_ms bigint,
    status text,
    span_data blob,  -- JSON serializado
    PRIMARY KEY ((customer_id, trace_id), timestamp, span_id)
) WITH CLUSTERING ORDER BY (timestamp DESC, span_id ASC)
  AND default_time_to_live = 63072000;  -- 2 años

-- Tabla materializada para queries por servicio
CREATE MATERIALIZED VIEW observability.traces_by_service AS
    SELECT customer_id, service_name, timestamp, trace_id, span_id
    FROM observability.traces
    WHERE customer_id IS NOT NULL 
      AND trace_id IS NOT NULL
      AND service_name IS NOT NULL
      AND timestamp IS NOT NULL
      AND span_id IS NOT NULL
    PRIMARY KEY ((customer_id, service_name), timestamp, trace_id, span_id)
    WITH CLUSTERING ORDER BY (timestamp DESC);
```

#### Configuración de Cassandra

```yaml
# cassandra.yaml (principales configuraciones)
cluster_name: 'ObservabilityCluster'

# Memoria
max_heap_size: 16G
heap_newsize: 4G

# Compaction (optimizado para time-series)
compaction_throughput_mb_per_sec: 256

# Escritura
commitlog_sync: periodic
commitlog_sync_period_in_ms: 10000
concurrent_writes: 128

# Lectura
concurrent_reads: 64
read_request_timeout_in_ms: 10000

# TTL automático (2 años)
gc_grace_seconds: 864000  # 10 días
```

#### Casos de Uso
- ✅ Análisis histórico (> 30 días)
- ✅ Reportes mensuales/anuales
- ✅ Compliance y auditoría
- ✅ Análisis de tendencias a largo plazo
- ✅ Capacity planning
- ✅ Forensics post-mortem

#### Límites
- ❌ Latencia más alta (500-2000ms)
- ❌ Queries complejas más lentas
- ❌ Requiere más recursos (RAM, CPU, disco)
- ❌ Complejidad operacional alta

---

## 🔀 Query Router: Lógica de Enrutamiento

### Estrategia de Routing

El routing de queries se maneja en **Grafana** mediante datasources duales y variables de tiempo:

```javascript
// Lógica conceptual en Grafana
function routeQuery(timeRange) {
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    if (timeRange.from > thirtyDaysAgo) {
        // Query reciente: usar Prometheus (fast)
        return "prometheus-datasource";
    } else {
        // Query histórica: usar Cassandra (slower but has data)
        return "cassandra-datasource";
    }
}
```

### Configuración de Grafana

```yaml
# grafana/provisioning/datasources/datasources.yml
apiVersion: 1

datasources:
  # Datasource para datos recientes (< 30 días)
  - name: Prometheus-Hot
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: "15s"
      queryTimeout: "30s"
    
  # Datasource para datos históricos (> 30 días)
  - name: Cassandra-Cold
    type: cassandra-datasource
    access: proxy
    url: http://cassandra-adapter:9042
    jsonData:
      keyspace: "observability"
      consistency: "ONE"
      timeout: "30s"
```

### Panel con Routing Automático

```json
{
  "datasource": {
    "type": "datasource",
    "uid": "-- Mixed --"
  },
  "targets": [
    {
      "datasource": {
        "type": "prometheus",
        "uid": "prometheus-hot"
      },
      "expr": "rate(cpu_usage[5m])",
      "hide": "${__from:date:YYYY-MM-DD} < ${__from:date:YYYY-MM-DD:-30d}"
    },
    {
      "datasource": {
        "type": "cassandra",
        "uid": "cassandra-cold"
      },
      "query": "SELECT metric_name, value FROM metrics WHERE timestamp >= ? AND timestamp <= ?",
      "hide": "${__from:date:YYYY-MM-DD} >= ${__from:date:YYYY-MM-DD:-30d}"
    }
  ]
}
```

---

## 📊 Comparativa de Rendimiento

| Aspecto | Prometheus (Hot) | Cassandra (Cold) |
|---------|-----------------|------------------|
| **Latencia típica** | 50-200 ms | 500-2000 ms |
| **Retención** | 30 días | 1-2 años (o más) |
| **Throughput escritura** | 100k samples/s | 1M+ samples/s |
| **Throughput lectura** | Alta (in-memory) | Media (disk-based) |
| **Costo por GB/mes** | $$$$ (SSD rápido) | $ (HDD/SSD mixto) |
| **Complejidad operacional** | Baja | Alta |
| **Queries soportadas** | PromQL (rico) | CQL (limitado) |
| **Agregaciones** | Ultra rápidas | Lentas (pre-calcular) |
| **Downsampling** | Manual/Externo | Integrado (compaction) |
| **Replicación** | No nativo | Sí (multi-DC) |

---

## 🔄 Flujo de Datos Completo

### 1. Escritura (Ingesta)

```
┌─────────────┐
│   Agente    │ (Genera telemetría)
└──────┬──────┘
       │ OTLP (gRPC/HTTP)
       ▼
┌─────────────┐
│  Collector  │ (Procesa y despacha)
└──────┬──────┘
       │
       ├─────────────────────────────┐
       │                             │
       ▼                             ▼
┌─────────────┐              ┌─────────────┐
│ Prometheus  │              │  Cassandra  │
│ (Remote     │              │  (Remote    │
│  Write)     │              │   Write)    │
└─────────────┘              └─────────────┘
  Últimos 30d                  Todo (1-2 años)
```

**Configuración del Collector:**

```yaml
# otel-collector-config.yaml
exporters:
  # Exportar a Prometheus
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: "customer_monitoring"
    
  # Exportar a Cassandra (vía adapter custom)
  otlphttp/cassandra:
    endpoint: "http://cassandra-adapter:8080/v1/traces"
    tls:
      insecure: true

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus, otlphttp/cassandra]  # Dual export
    
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/cassandra]  # Solo Cassandra para traces
```

### 2. Lectura (Queries)

```
┌─────────────┐
│   Grafana   │ (Usuario hace query)
└──────┬──────┘
       │
       ├─ Evalúa time range
       │
       ├──▶ < 30 días? ──▶ Query a Prometheus (rápido)
       │
       └──▶ > 30 días? ──▶ Query a Cassandra (lento)
```

---

## 🔧 Downsampling y Compactación

### Estrategia de Downsampling

A medida que los datos envejecen, reducir la resolución para ahorrar espacio:

```
Edad de datos     │ Resolución    │ Storage
──────────────────┼───────────────┼──────────────
0-7 días          │ 15 segundos   │ Prometheus
7-30 días         │ 1 minuto      │ Prometheus
30-90 días        │ 5 minutos     │ Cassandra
90-365 días       │ 15 minutos    │ Cassandra
1-2 años          │ 1 hora        │ Cassandra
> 2 años          │ Eliminado     │ -
```

**Implementación con Cassandra TTL:**

```cql
-- Tabla para datos raw (alta resolución)
CREATE TABLE metrics_raw (
    ...
) WITH default_time_to_live = 2592000;  -- 30 días

-- Tabla para datos downsampled 5min
CREATE TABLE metrics_5min (
    ...
) WITH default_time_to_live = 7776000;  -- 90 días

-- Tabla para datos downsampled 1h
CREATE TABLE metrics_1h (
    ...
) WITH default_time_to_live = 63072000;  -- 2 años
```

**Job de Downsampling (Spark/Airflow):**

```python
# Pseudo-código del job diario
def downsample_daily():
    # Agregar datos de 30 días atrás (ya no en Prometheus)
    query = """
        SELECT customer_id, metric_name, 
               date_trunc('minute', timestamp, 5) as ts_5min,
               avg(value) as avg_value,
               max(value) as max_value,
               min(value) as min_value
        FROM metrics_raw
        WHERE timestamp >= now() - interval '31 days'
          AND timestamp < now() - interval '30 days'
        GROUP BY customer_id, metric_name, ts_5min
    """
    
    # Insertar en tabla downsampled
    results = cassandra.execute(query)
    cassandra.batch_insert('metrics_5min', results)
```

---

## 🚀 Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  # Prometheus (Hot Storage)
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus-hot
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--storage.tsdb.retention.size=100GB'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    networks:
      - observability

  # Cassandra Node 1 (Cold Storage)
  cassandra-1:
    image: cassandra:4.1
    container_name: cassandra-cold-1
    environment:
      - CASSANDRA_CLUSTER_NAME=ObservabilityCluster
      - CASSANDRA_DC=datacenter1
      - CASSANDRA_RACK=rack1
      - CASSANDRA_ENDPOINT_SNITCH=GossipingPropertyFileSnitch
      - MAX_HEAP_SIZE=16G
      - HEAP_NEWSIZE=4G
    volumes:
      - cassandra-data-1:/var/lib/cassandra
    ports:
      - "9042:9042"
    networks:
      - observability
    healthcheck:
      test: ["CMD-SHELL", "nodetool status"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Cassandra Node 2
  cassandra-2:
    image: cassandra:4.1
    container_name: cassandra-cold-2
    environment:
      - CASSANDRA_CLUSTER_NAME=ObservabilityCluster
      - CASSANDRA_DC=datacenter1
      - CASSANDRA_RACK=rack2
      - CASSANDRA_SEEDS=cassandra-1
    volumes:
      - cassandra-data-2:/var/lib/cassandra
    networks:
      - observability
    depends_on:
      - cassandra-1

  # Cassandra Node 3
  cassandra-3:
    image: cassandra:4.1
    container_name: cassandra-cold-3
    environment:
      - CASSANDRA_CLUSTER_NAME=ObservabilityCluster
      - CASSANDRA_DC=datacenter1
      - CASSANDRA_RACK=rack3
      - CASSANDRA_SEEDS=cassandra-1
    volumes:
      - cassandra-data-3:/var/lib/cassandra
    networks:
      - observability
    depends_on:
      - cassandra-1

  # Cassandra Adapter (Prometheus -> Cassandra bridge)
  cassandra-adapter:
    image: cassandra-prometheus-adapter:latest
    container_name: cassandra-adapter
    environment:
      - CASSANDRA_HOSTS=cassandra-1,cassandra-2,cassandra-3
      - CASSANDRA_KEYSPACE=observability
      - CASSANDRA_CONSISTENCY=QUORUM
    ports:
      - "9201:9201"
    networks:
      - observability
    depends_on:
      - cassandra-1

  # Grafana (Visualization)
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    ports:
      - "3000:3000"
    networks:
      - observability
    depends_on:
      - prometheus
      - cassandra-adapter

volumes:
  prometheus-data:
  cassandra-data-1:
  cassandra-data-2:
  cassandra-data-3:
  grafana-data:

networks:
  observability:
    driver: bridge
```

---

## 📈 Monitoring del Storage Layer

### Métricas Clave a Monitorear

#### Prometheus
```promql
# Uso de disco
prometheus_tsdb_storage_blocks_bytes

# Tasa de ingesta
rate(prometheus_tsdb_head_samples_appended_total[5m])

# Latencia de queries
prometheus_http_request_duration_seconds{handler="/api/v1/query"}
```

#### Cassandra
```bash
# Via nodetool
nodetool status           # Estado del cluster
nodetool tpstats          # Thread pool stats
nodetool cfstats          # Table statistics
nodetool tablestats       # Disk usage per table

# Métricas JMX expuestas
org.apache.cassandra.metrics:type=ClientRequest,scope=Read,name=Latency
org.apache.cassandra.metrics:type=Storage,name=Load
```

---

## 🎯 Best Practices

### ✅ DO:
- **Etiquetar correctamente**: Todos los datos con `customer_id`, `node_id`, `environment`
- **Monitoring del monitoring**: Alertas sobre latencia de storage
- **Backups regulares**: Snapshots de Cassandra cada 24h
- **Testing de disaster recovery**: Simular caídas de nodos
- **Capacity planning**: Monitorear crecimiento de datos semanalmente

### ❌ DON'T:
- **No queries pesadas en Prometheus**: Usar recording rules
- **No retención infinita**: Respetar TTLs, limpiar datos antiguos
- **No single point of failure**: Mínimo 3 nodos Cassandra
- **No ignores compaction**: Configurar ventanas de mantenimiento
- **No subestimar recursos**: Cassandra necesita memoria y disco generosos

---

## 🔍 Troubleshooting

### Problema: Queries lentas en Grafana
```bash
# Verificar qué datasource está siendo usado
# Si es Prometheus y > 30 días: BUG en routing
# Si es Cassandra y < 30 días: BUG en routing

# Check latencia Prometheus
curl http://prometheus:9090/api/v1/query?query=up

# Check latencia Cassandra
cqlsh -e "SELECT * FROM observability.metrics LIMIT 1;"
```

### Problema: Cassandra nodo caído
```bash
# Verificar estado del cluster
nodetool status

# Reiniciar nodo
docker restart cassandra-cold-2

# Reparar datos (después de reinicio)
nodetool repair -pr observability
```

### Problema: Prometheus sin espacio
```bash
# Reducir retención temporalmente
# En prometheus.yml: retention.time: 15d

# O expandir disco
docker volume inspect prometheus-data
```

---

## 📚 Referencias

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Cassandra Documentation](https://cassandra.apache.org/doc/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [Grafana Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Time-Series Data on Cassandra](https://www.datastax.com/blog/time-series-data-cassandra)

---

## 🎯 Resumen

Este storage layer híbrido proporciona:
- ⚡ **Rendimiento óptimo** para queries en tiempo real (Prometheus)
- 💾 **Retención masiva** para compliance y análisis histórico (Cassandra)
- 🔀 **Routing inteligente** según antigüedad de datos
- 📈 **Escalabilidad** horizontal y vertical
- 🛡️ **Alta disponibilidad** mediante replicación

**Trade-off aceptado**: Mayor complejidad operacional a cambio de zero data loss y capacidades enterprise de análisis histórico.
