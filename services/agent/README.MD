# OpenTelemetry Agent - Agente de Monitoreo

## 📋 Descripción

El **Agent** es una aplicación ligera escrita en Go que implementa el SDK de OpenTelemetry. Se despliega en cada nodo del cliente y es responsable de generar, capturar y exportar telemetría (métricas, trazas y logs) en tiempo real al Collector central.

## 🎯 Propósito

Proporcionar **observabilidad completa** de los nodos de los clientes sin requerir cambios en sus aplicaciones, con mínimo overhead de recursos y máxima simplicidad operacional.

---

## 1. Funcionamiento del Agente

El agente es una **aplicación escrita en Go que implementa el SDK de OpenTelemetry**. Su función principal es **generar y exportar telemetría (trazas, métricas y logs) en tiempo real** directamente al Collector.

### Arquitectura: Enfoque de OpenTelemetry

OpenTelemetry utiliza un modelo de **observabilidad distribuida** con los siguientes componentes:

```
┌─────────────────────────┐
│   Aplicación Go         │
│   (Agent con SDK)       │
│                         │
│  ┌──────────────────┐   │
│  │ OpenTelemetry    │   │
│  │ SDK              │   │───┐
│  │ - Tracer         │   │   │ Genera telemetría
│  │ - Meter          │   │   │ internamente
│  │ - Logger         │   │   │
│  └──────────────────┘   │◄──┘
│           │             │
│  ┌──────────────────┐   │
│  │ OTLP Exporter    │   │───┐
│  └──────────────────┘   │   │ Envía datos via OTLP
└───────────┬─────────────┘   │ (cliente, no servidor)
            │                 │
            │ Conexión        │
            │ saliente        │
            ▼                 ▼
    ┌─────────────────────────────┐
    │   OpenTelemetry Collector   │
    │   (Recibe en 4317/4318)     │
    └─────────────────────────────┘
```

### ¿Cómo logra exportar métricas en tiempo real?

El agente implementa el siguiente flujo:

1. **Instrumentación del Código**: La aplicación Go utiliza el SDK de OpenTelemetry para instrumentar su código:
   ```go
   import (
       "go.opentelemetry.io/otel"
       "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
       "go.opentelemetry.io/otel/sdk/trace"
   )
   
   // El agente NO expone puertos, sino que se conecta al Collector
   ```

2. **Generación de Telemetría**: El SDK captura automáticamente:
   - **Trazas (Traces)**: Seguimiento de solicitudes a través de servicios
   - **Métricas (Metrics)**: Contadores, gauges, histogramas de rendimiento
   - **Logs**: Eventos y mensajes de la aplicación

3. **Exportación en Tiempo Real**: El OTLP Exporter del SDK **se conecta al Collector** (actúa como cliente):
   - Se conecta al **Collector en `collector:4317`** (gRPC) o `collector:4318` (HTTP)
   - **NO expone estos puertos**, sino que los consume como cliente
   - Envía los datos en formato OTLP de forma continua

4. **Buffer Interno**: El SDK mantiene un buffer en memoria que:
   - Agrupa datos en lotes (batching) para eficiencia
   - Reintenta envíos fallidos
   - **Puede perder datos** si el buffer se llena y el Collector no está disponible

### Ventajas del Enfoque SDK

- **Contexto Rico**: Captura información detallada desde dentro de la aplicación
- **Bajo Overhead**: El SDK es ligero y optimizado para producción
- **Propagación de Contexto**: Mantiene trace context entre servicios distribuidos
- **Vendor Neutral**: Los datos pueden enviarse a cualquier backend compatible con OTLP

## 2. Persistencia de Trazas Perdidas en Cassandra

### Problema: Pérdida de Trazas por Buffer Lleno del SDK

Cuando el **buffer interno del SDK de Go** se llena (debido a alta carga o el Collector no disponible), las trazas nuevas se pierden porque:

- El SDK tiene memoria limitada para no afectar la aplicación principal
- Si el Collector está caído o lento, el buffer se satura
- El SDK descarta trazas para no consumir toda la RAM

### Solución: Exportador Dual con Fallback a Cassandra

Para evitar pérdida de datos, la aplicación Go debe configurar **múltiples exportadores** en el SDK:

```go
// Configuración del SDK con doble exportación
func initTracer() (*trace.TracerProvider, error) {
    // Exportador principal al Collector (OTLP)
    otlpExporter, err := otlptracegrpc.New(
        context.Background(),
        otlptracegrpc.WithEndpoint("collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    
    // Exportador de respaldo a Cassandra
    cassandraExporter := NewCassandraExporter(&CassandraConfig{
        Hosts:    []string{"cassandra:9042"},
        Keyspace: "otel_traces",
    })
    
    // SpanProcessor con doble exportación
    tp := trace.NewTracerProvider(
        trace.WithBatcher(otlpExporter,
            trace.WithMaxQueueSize(2048),
            trace.WithMaxExportBatchSize(512),
        ),
        // Fallback a Cassandra cuando OTLP falla
        trace.WithSyncer(cassandraExporter),
    )
    
    return tp, nil
}
```

### Estrategias de Implementación

#### Opción 1: Exportador Personalizado a Cassandra (Recomendado)

Implementar un `SpanExporter` custom en Go que escriba directamente a Cassandra:

```go
type CassandraExporter struct {
    session *gocql.Session
}

func (e *CassandraExporter) ExportSpans(ctx context.Context, spans []trace.ReadOnlySpan) error {
    for _, span := range spans {
        query := `INSERT INTO traces_overflow 
                  (trace_id, span_id, timestamp, service_name, operation_name, trace_data)
                  VALUES (?, ?, ?, ?, ?, ?)`
        
        err := e.session.Query(query,
            span.SpanContext().TraceID().String(),
            span.SpanContext().SpanID().String(),
            span.StartTime(),
            span.Resource().Attributes()["service.name"],
            span.Name(),
            marshalSpan(span),
        ).WithContext(ctx).Exec()
        
        if err != nil {
            return err
        }
    }
    return nil
}
```

#### Opción 2: Circuit Breaker con Cola Persistente

Usar un patrón de Circuit Breaker que escriba a Cassandra cuando el Collector falla:

```go
func (a *Agent) exportWithFallback(spans []trace.ReadOnlySpan) error {
    // Intentar enviar al Collector primero
    err := a.otlpExporter.ExportSpans(context.Background(), spans)
    
    if err != nil {
        // Si falla, persistir en Cassandra
        log.Warn("Collector unavailable, falling back to Cassandra")
        return a.cassandraExporter.ExportSpans(context.Background(), spans)
    }
    
    return nil
}
```

### Implementación Recomendada

1. **Esquema en Cassandra**:
   ```cql
   CREATE KEYSPACE IF NOT EXISTS otel_traces 
   WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 3};
   
   CREATE TABLE otel_traces.traces_overflow (
       trace_id text,
       span_id text,
       timestamp timestamp,
       service_name text,
       operation_name text,
       trace_data blob,
       PRIMARY KEY (trace_id, span_id)
   );
   ```

2. **Política de Retención**: Configurar TTL (Time To Live) en Cassandra para eliminar automáticamente trazas antiguas:
   ```cql
   ALTER TABLE otel_traces.traces_overflow 
   WITH default_time_to_live = 604800;  -- 7 días
   ```

3. **Recuperación de Trazas**: Implementar un proceso batch que periódicamente lea las trazas de Cassandra y las reenvíe al Collector cuando esté disponible.

### Beneficios

- ✅ **Sin pérdida de datos**: Todas las trazas se preservan incluso bajo alta carga
- ✅ **Alta disponibilidad**: Cassandra proporciona replicación y tolerancia a fallos
- ✅ **Escalabilidad**: Cassandra puede manejar grandes volúmenes de escrituras
- ✅ **Análisis posterior**: Las trazas persistidas pueden analizarse posteriormente

---

## 🚀 Deployment

### Prerrequisitos

- Docker & Docker Compose (recomendado)
- O Go 1.21+ para compilación nativa
- Acceso de red al Collector central (puerto 4317/4318)

### Opción 1: Docker Compose (Recomendado)

```yaml
# docker-compose.yaml
version: '3.8'

services:
  otel-agent:
    image: tu-empresa/otel-agent:latest
    container_name: otel-agent
    environment:
      # Configuración del Collector central
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://collector.tuempresa.com:4317
      - OTEL_EXPORTER_OTLP_INSECURE=true
      
      # Identificación del cliente y nodo
      - CUSTOMER_ID=cliente-a
      - CUSTOMER_NAME=Empresa XYZ
      - NODE_ID=prod-web-01
      - NODE_REGION=us-east-1
      - ENVIRONMENT=production
      
      # Configuración del agente
      - HEALTH_CHECK_PORT=8080
      - METRICS_INTERVAL=15s
    ports:
      - "8080:8080"  # Health check endpoint
    networks:
      - monitoring
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    # Recursos limitados (bajo overhead)
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M

networks:
  monitoring:
    driver: bridge
```

**Comandos:**

```bash
# Levantar el agente
docker-compose up -d

# Ver logs
docker logs -f otel-agent

# Verificar health
curl http://localhost:8080/health

# Ver métricas
curl http://localhost:8080/metrics
```

### Opción 2: Binario Nativo

```bash
# Compilar
cd services/agent
go build -o otel-agent main.go

# Ejecutar
./otel-agent \
  --collector-endpoint=collector.tuempresa.com:4317 \
  --customer-id=cliente-a \
  --node-id=prod-web-01 \
  --health-port=8080
```

### Opción 3: Kubernetes DaemonSet

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: otel-agent
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: otel-agent
  template:
    metadata:
      labels:
        app: otel-agent
    spec:
      containers:
      - name: otel-agent
        image: tu-empresa/otel-agent:latest
        env:
        - name: OTEL_EXPORTER_OTLP_ENDPOINT
          value: "http://collector.observability.svc.cluster.local:4317"
        - name: CUSTOMER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: NODE_ID
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        ports:
        - containerPort: 8080
          name: health
        resources:
          limits:
            memory: "256Mi"
            cpu: "500m"
          requests:
            memory: "64Mi"
            cpu: "100m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
```

---

## 🏥 Health Check Endpoint

El agente expone un endpoint `/health` que proporciona información detallada sobre su estado.

### Endpoints Disponibles

#### GET `/health` - Health Check General

```bash
curl http://localhost:8080/health
```

**Respuesta cuando está sano:**

```json
{
  "status": "healthy",
  "timestamp": "2025-10-31T10:30:00Z",
  "uptime_seconds": 259200,
  "version": "1.0.0",
  "checks": {
    "application": {
      "status": "healthy",
      "message": "Agent running normally"
    },
    "collector_connectivity": {
      "status": "healthy",
      "endpoint": "collector.tuempresa.com:4317",
      "last_successful_send": "2025-10-31T10:29:45Z",
      "latency_ms": 12
    },
    "buffer": {
      "status": "healthy",
      "current_size": 512,
      "max_size": 2048,
      "usage_percent": 25,
      "dropped_spans": 0
    },
    "system_resources": {
      "status": "healthy",
      "cpu_percent": 5.2,
      "memory_mb": 87.3,
      "memory_percent": 8.5
    }
  }
}
```

**Respuesta cuando está degradado:**

```json
{
  "status": "degraded",
  "timestamp": "2025-10-31T10:30:00Z",
  "uptime_seconds": 259200,
  "version": "1.0.0",
  "checks": {
    "application": {
      "status": "healthy",
      "message": "Agent running normally"
    },
    "collector_connectivity": {
      "status": "unhealthy",
      "endpoint": "collector.tuempresa.com:4317",
      "last_successful_send": "2025-10-31T10:15:00Z",
      "error": "connection timeout",
      "retry_attempts": 5
    },
    "buffer": {
      "status": "warning",
      "current_size": 1536,
      "max_size": 2048,
      "usage_percent": 75,
      "dropped_spans": 12
    },
    "system_resources": {
      "status": "healthy",
      "cpu_percent": 6.8,
      "memory_mb": 95.1,
      "memory_percent": 9.3
    }
  }
}
```

#### GET `/health/live` - Liveness Probe

```bash
curl http://localhost:8080/health/live
```

Responde 200 si el proceso está vivo, 503 si no.

#### GET `/health/ready` - Readiness Probe

```bash
curl http://localhost:8080/health/ready
```

Responde 200 si está listo para recibir tráfico, 503 si no.

#### GET `/metrics` - Métricas Prometheus

```bash
curl http://localhost:8080/metrics
```

Expone métricas en formato Prometheus para scraping directo.

---

## 📊 Métricas Exportadas

### Métricas del Sistema

```promql
# CPU usage
system_cpu_usage{customer_id="cliente-a", node_id="prod-web-01"}

# Memoria usage
system_memory_usage_bytes{customer_id="cliente-a", node_id="prod-web-01"}

# Disco usage
system_disk_usage_bytes{customer_id="cliente-a", node_id="prod-web-01", mount_point="/"}

# Network I/O
system_network_io_bytes{customer_id="cliente-a", node_id="prod-web-01", direction="tx|rx"}
```

### Métricas del Agente

```promql
# Estado del buffer
agent_buffer_size{customer_id="cliente-a", node_id="prod-web-01"}
agent_buffer_usage_percent{customer_id="cliente-a", node_id="prod-web-01"}

# Conectividad al Collector
agent_collector_reachable{customer_id="cliente-a", node_id="prod-web-01"}
agent_collector_latency_ms{customer_id="cliente-a", node_id="prod-web-01"}

# Throughput
agent_spans_sent_total{customer_id="cliente-a", node_id="prod-web-01"}
agent_spans_dropped_total{customer_id="cliente-a", node_id="prod-web-01"}
```

---

## 🔧 Configuración Avanzada

### Variables de Entorno

| Variable | Descripción | Default | Ejemplo |
|----------|-------------|---------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL del Collector | - | `http://collector:4317` |
| `OTEL_EXPORTER_OTLP_INSECURE` | Deshabilitar TLS | `false` | `true` |
| `CUSTOMER_ID` | ID único del cliente | - | `cliente-a` |
| `CUSTOMER_NAME` | Nombre del cliente | - | `Empresa XYZ` |
| `NODE_ID` | ID único del nodo | `hostname` | `prod-web-01` |
| `NODE_REGION` | Región del nodo | - | `us-east-1` |
| `ENVIRONMENT` | Ambiente | `production` | `staging` |
| `HEALTH_CHECK_PORT` | Puerto health check | `8080` | `8080` |
| `METRICS_INTERVAL` | Intervalo de métricas | `15s` | `30s` |
| `BUFFER_MAX_SIZE` | Tamaño máximo buffer | `2048` | `4096` |
| `LOG_LEVEL` | Nivel de logs | `info` | `debug` |

### Archivo de Configuración

```yaml
# agent-config.yaml
collector:
  endpoint: "collector.tuempresa.com:4317"
  insecure: true
  timeout: 10s
  retry:
    enabled: true
    initial_interval: 1s
    max_interval: 30s
    max_elapsed_time: 5m

customer:
  id: "cliente-a"
  name: "Empresa XYZ"

node:
  id: "prod-web-01"
  region: "us-east-1"
  environment: "production"

telemetry:
  metrics:
    interval: 15s
    enabled: true
  traces:
    enabled: true
    sample_rate: 1.0
  logs:
    enabled: true
    level: "info"

buffer:
  max_size: 2048
  batch_size: 512
  flush_interval: 5s

health_check:
  port: 8080
  path: "/health"
```

---

## 🔍 Troubleshooting

### Problema: Agente no puede conectar al Collector

```bash
# 1. Verificar logs
docker logs otel-agent | grep -i error

# 2. Test conectividad de red
telnet collector.tuempresa.com 4317

# 3. Verificar DNS
nslookup collector.tuempresa.com

# 4. Ver health check
curl http://localhost:8080/health | jq '.checks.collector_connectivity'

# 5. Verificar firewall
# Asegurar que puerto 4317 (gRPC) esté abierto
```

### Problema: Buffer saturado

```bash
# 1. Ver estado del buffer
curl http://localhost:8080/health | jq '.checks.buffer'

# 2. Aumentar tamaño del buffer
# Editar docker-compose.yaml:
# - BUFFER_MAX_SIZE=4096

# 3. Reducir intervalo de métricas
# - METRICS_INTERVAL=30s

# 4. Reiniciar agente
docker restart otel-agent
```

### Problema: Alto uso de memoria

```bash
# 1. Ver uso actual
docker stats otel-agent

# 2. Reducir buffer size
# - BUFFER_MAX_SIZE=1024

# 3. Deshabilitar traces si no son necesarias
# - TRACES_ENABLED=false

# 4. Limitar memoria en Docker
# deploy:
#   resources:
#     limits:
#       memory: 128M
```

### Problema: Health check falla

```bash
# 1. Verificar que el puerto esté abierto
netstat -tulpn | grep 8080

# 2. Test directo
curl -v http://localhost:8080/health

# 3. Ver logs del agente
docker logs otel-agent | tail -50

# 4. Verificar si el proceso está vivo
docker exec otel-agent ps aux | grep otel-agent
```

---

## 🔔 Monitoreo del Agente

### Alertas Recomendadas en Prometheus

```yaml
groups:
  - name: agent_health
    interval: 30s
    rules:
      # Agente caído
      - alert: AgentDown
        expr: up{job="customer-agents"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Agente {{ $labels.node_id }} caído"
      
      # No puede conectar al Collector
      - alert: AgentCollectorUnreachable
        expr: agent_collector_reachable == 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Agente {{ $labels.node_id }} no alcanza Collector"
      
      # Buffer saturado
      - alert: AgentBufferSaturated
        expr: agent_buffer_usage_percent > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Buffer del agente {{ $labels.node_id }} al {{ $value }}%"
      
      # Alto uso de memoria
      - alert: AgentHighMemory
        expr: agent_memory_usage_mb > 200
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Agente {{ $labels.node_id }} usando {{ $value }}MB RAM"
```

### Dashboard en Grafana

Paneles recomendados:
1. **Estado de Agentes**: Mapa de todos los agentes (verde/rojo)
2. **Conectividad**: Gráfica de agentes conectados al Collector
3. **Buffer Usage**: Uso del buffer por agente
4. **System Metrics**: CPU, RAM, Disco por nodo
5. **Throughput**: Spans enviados por segundo

---

## 🧪 Testing

### Test Local

```bash
# 1. Levantar un collector local
cd services/collector
docker-compose up -d

# 2. Configurar agente para apuntar local
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# 3. Ejecutar agente
go run main.go

# 4. Verificar que envía datos
docker logs otel-collector | grep "Span"
```

### Test de Carga

```bash
# Simular 1000 spans/segundo
for i in {1..1000}; do
  curl -X POST http://localhost:4317/v1/traces &
done
wait

# Ver métricas del agente
curl http://localhost:8080/metrics | grep agent_spans
```

---

## 📚 Referencias

- [OpenTelemetry Go SDK](https://github.com/open-telemetry/opentelemetry-go)
- [OTLP Specification](https://github.com/open-telemetry/opentelemetry-proto)
- [Go SDK Examples](https://github.com/open-telemetry/opentelemetry-go/tree/main/example)
- [Best Practices](https://opentelemetry.io/docs/instrumentation/go/manual/)

---

## 🎯 Checklist de Deployment

- [ ] Variables de entorno configuradas (`CUSTOMER_ID`, `NODE_ID`)
- [ ] Conectividad al Collector verificada (puerto 4317)
- [ ] Health check respondiendo (puerto 8080)
- [ ] Prometheus configurado para scrappear `/metrics`
- [ ] Alertas configuradas en Prometheus
- [ ] Dashboard en Grafana creado
- [ ] Logs siendo recolectados
- [ ] Recursos limitados en Docker/K8s
- [ ] Restart policy configurado
- [ ] Monitoreo del propio agente activo

---

**Versión**: 1.0.0
**Última actualización**: Octubre 31, 2025
