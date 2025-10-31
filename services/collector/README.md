# OpenTelemetry Collector - Componente Central

## 📋 Descripción

El **OpenTelemetry Collector** es el componente central de la arquitectura que actúa como dispatcher inteligente. Recibe telemetría de múltiples agentes distribuidos en los nodos de los clientes y la distribuye a los sistemas de almacenamiento (Prometheus y Cassandra).

## 🎯 Responsabilidades

1. **Recepción de Telemetría**
   - Recibir datos OTLP (trazas, métricas, logs) de todos los agentes
   - Soportar múltiples protocolos: gRPC y HTTP
   - Manejar miles de conexiones simultáneas

2. **Procesamiento**
   - Agrupar datos en lotes (batching) para eficiencia
   - Enriquecer datos con metadata adicional
   - Validar multi-tenancy (presencia de `customer_id`)
   - Filtrar datos inválidos o malformados
   - Limitar uso de memoria

3. **Distribución**
   - Exportar a Prometheus (hot storage - 30 días)
   - Exportar a Cassandra (cold storage - 1-2 años)
   - Mantener pipelines independientes para trazas, métricas y logs

4. **Observabilidad Propia**
   - Exponer métricas internas para monitoreo
   - Health checks para orquestación
   - Logs estructurados para debugging

---

## 🏗️ Arquitectura

```
                    ┌──────────────────────────────────┐
                    │   NODOS DE CLIENTES (miles)      │
                    │   Agentes con SDK OpenTelemetry  │
                    └────────────┬─────────────────────┘
                                 │
                                 │ OTLP (gRPC:4317 / HTTP:4318)
                                 │
                    ┌────────────▼─────────────┐
                    │   COLLECTOR (este)       │
                    │                          │
                    │  ┌────────────────────┐  │
                    │  │   RECEIVERS        │  │
                    │  │  - OTLP gRPC       │  │
                    │  │  - OTLP HTTP       │  │
                    │  └──────────┬─────────┘  │
                    │             │             │
                    │  ┌──────────▼─────────┐  │
                    │  │   PROCESSORS       │  │
                    │  │  - memory_limiter  │  │
                    │  │  - attributes      │  │
                    │  │  - filter          │  │
                    │  │  - batch           │  │
                    │  └──────────┬─────────┘  │
                    │             │             │
                    │  ┌──────────▼─────────┐  │
                    │  │   EXPORTERS        │  │
                    │  │  - prometheus      │  │
                    │  │  - cassandra       │  │
                    │  │  - debug           │  │
                    │  └────────────────────┘  │
                    └────────┬────────┬────────┘
                             │        │
                  ┌──────────┘        └──────────┐
                  │                               │
         ┌────────▼────────┐           ┌─────────▼─────────┐
         │  PROMETHEUS     │           │   CASSANDRA       │
         │  (Hot - 30d)    │           │   (Cold - 2 años) │
         └─────────────────┘           └───────────────────┘
```

---

## 🔧 Configuración

### Archivo: `otel-collector-config.yaml`

#### 1. **Receivers** (Recepción de Datos)

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317  # Puerto para gRPC
      http:
        endpoint: 0.0.0.0:4318  # Puerto para HTTP
```

**Características:**
- Escucha en todas las interfaces (`0.0.0.0`)
- Soporta ambos protocolos simultáneamente
- Compatible con todos los SDKs de OpenTelemetry

#### 2. **Processors** (Procesamiento)

```yaml
processors:
  # Limitar uso de memoria (evita OOM)
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  
  # Enriquecer con metadata
  attributes:
    actions:
      - key: collector.name
        value: central-collector
        action: insert
  
  # Validar multi-tenancy
  filter:
    error_mode: ignore
    traces:
      span:
        - 'attributes["customer.id"] == nil'
  
  # Agrupar en lotes
  batch:
    timeout: 10s
    send_batch_size: 1024
```

**Orden de procesamiento (importante):**
1. `memory_limiter` - Primero, proteger memoria
2. `attributes` - Enriquecer datos
3. `filter` - Filtrar inválidos
4. `batch` - Agrupar para eficiencia

#### 3. **Exporters** (Exportación)

```yaml
exporters:
  # Prometheus (métricas en tiempo real)
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: "customer_monitoring"
  
  # Cassandra (histórico) - via adapter
  otlphttp/cassandra:
    endpoint: "http://cassandra-adapter:8080/v1/traces"
  
  # Debug (desarrollo)
  debug:
    verbosity: detailed
```

#### 4. **Extensions** (Funcionalidad Adicional)

```yaml
extensions:
  # Health check para Kubernetes/Docker
  health_check:
    endpoint: "0.0.0.0:13133"
    path: "/health"
  
  # Métricas internas
  zpages:
    endpoint: "0.0.0.0:55679"
```

#### 5. **Pipelines** (Flujos de Datos)

```yaml
service:
  extensions: [health_check, zpages]
  
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, attributes, filter, batch]
      exporters: [debug, otlphttp/cassandra]
    
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, attributes, filter, batch]
      exporters: [prometheus, debug]
    
    logs:
      receivers: [otlp]
      processors: [memory_limiter, attributes, batch]
      exporters: [debug]
```

---

## 🚀 Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    container_name: otel-collector
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8889:8889"   # Prometheus exporter
      - "13133:13133" # Health check
      - "55679:55679" # zpages
    environment:
      - TIMESTAMP=${TIMESTAMP:-$(date +%s)}
    networks:
      - observability
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:13133/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  observability:
    driver: bridge
```

### Comandos de Deployment

```bash
# Levantar el collector
cd services/collector
docker-compose up -d

# Ver logs
docker logs -f otel-collector

# Verificar health
curl http://localhost:13133/health

# Ver métricas internas
curl http://localhost:8889/metrics
```

---

## 📊 Monitoreo del Collector

### Métricas Clave

#### Receiver Metrics (Ingesta)

```promql
# Tasa de spans aceptados
rate(otelcol_receiver_accepted_spans[5m])

# Tasa de spans rechazados
rate(otelcol_receiver_refused_spans[5m])

# Conexiones activas
otelcol_receiver_accepted_connections
```

#### Processor Metrics (Procesamiento)

```promql
# Items en el batch processor
otelcol_processor_batch_batch_size_trigger_send

# Memory limiter drops
rate(otelcol_processor_dropped_spans[5m])

# Latencia de procesamiento
histogram_quantile(0.95, otelcol_processor_batch_batch_send_duration_bucket)
```

#### Exporter Metrics (Exportación)

```promql
# Tasa de exportación exitosa
rate(otelcol_exporter_sent_spans[5m])

# Errores de exportación
rate(otelcol_exporter_send_failed_spans[5m])

# Queue size (backpressure)
otelcol_exporter_queue_size
```

### Dashboard en Grafana

Importar dashboard preconstruido:
- [OpenTelemetry Collector Dashboard](https://grafana.com/grafana/dashboards/15983)

Paneles recomendados:
1. **Ingesta Rate**: Spans/métricas/logs por segundo
2. **Processing Latency**: P50, P95, P99
3. **Export Success Rate**: Porcentaje de éxito
4. **Memory Usage**: Uso de memoria vs límite
5. **Queue Depth**: Profundidad de colas de exportación

---

## 🔔 Alertas Recomendadas

### Alertas Críticas

```yaml
groups:
  - name: collector_critical
    interval: 30s
    rules:
      # Collector caído
      - alert: CollectorDown
        expr: up{job="otel-collector"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Collector está caído - sin ingesta de telemetría"
      
      # Alta tasa de errores de exportación
      - alert: CollectorExportFailureHigh
        expr: rate(otelcol_exporter_send_failed_spans[5m]) > 100
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Collector fallando al exportar: {{ $value }} spans/s"
      
      # Memoria cerca del límite
      - alert: CollectorMemoryHigh
        expr: otelcol_process_memory_rss / 1024 / 1024 > 450
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Collector usando {{ $value }}MB de RAM (límite: 512MB)"
```

### Alertas de Warning

```yaml
      # Tasa de rechazo elevada
      - alert: CollectorRefusingSpans
        expr: rate(otelcol_receiver_refused_spans[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Collector rechazando spans: {{ $value }}/s"
      
      # Queue creciendo (backpressure)
      - alert: CollectorQueueGrowing
        expr: otelcol_exporter_queue_size > 5000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Queue del exporter en {{ $value }} items"
```

---

## 🔍 Troubleshooting

### Problema: Collector no recibe datos

```bash
# 1. Verificar que esté corriendo
docker ps | grep otel-collector

# 2. Check logs
docker logs otel-collector | tail -100

# 3. Verificar puertos abiertos
netstat -tulpn | grep -E '4317|4318'

# 4. Test de conectividad desde agente
telnet <collector-ip> 4317

# 5. Ver métricas de receiver
curl http://localhost:8889/metrics | grep otelcol_receiver
```

### Problema: High memory usage

```bash
# 1. Ver uso actual
docker stats otel-collector

# 2. Ajustar memory_limiter en config
# limit_mib: 512 → aumentar si es necesario

# 3. Reducir batch size
# send_batch_size: 1024 → 512

# 4. Reiniciar collector
docker restart otel-collector
```

### Problema: Exportación lenta a Prometheus

```bash
# 1. Ver latencia de scrape en Prometheus
# http://localhost:9090/targets

# 2. Reducir intervalo de scrape
# scrape_interval: 15s → 30s

# 3. Verificar tamaño de métricas
curl http://localhost:8889/metrics | wc -l
```

### Problema: Datos sin customer_id

```bash
# 1. Ver logs del filter processor
docker logs otel-collector | grep filter

# 2. Verificar que agentes estén etiquetando
# En agente: resource.attributes["customer.id"] debe existir

# 3. Temporalmente deshabilitar filter para debugging
# Comentar 'filter' en processors list
```

---

## 🧪 Testing

### Test Manual con curl

```bash
# Enviar métrica de prueba (HTTP)
curl -X POST http://localhost:4318/v1/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [{
          "key": "customer.id",
          "value": {"stringValue": "test-customer"}
        }]
      },
      "scopeMetrics": [{
        "metrics": [{
          "name": "test_metric",
          "gauge": {
            "dataPoints": [{
              "asDouble": 42.0,
              "timeUnixNano": "'$(date +%s)000000000'"
            }]
          }
        }]
      }]
    }]
  }'
```

### Test con Python Script

```python
# test_collector.py (ya existe)
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Configurar exporter al collector
otlp_exporter = OTLPSpanExporter(
    endpoint="localhost:4317",
    insecure=True
)

# Configurar tracer
trace.set_tracer_provider(TracerProvider())
trace.get_tracer_provider().add_span_processor(
    BatchSpanProcessor(otlp_exporter)
)

# Crear trace de prueba
tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span("test-span") as span:
    span.set_attribute("customer.id", "test-customer")
    span.set_attribute("test", "value")
    print("Span enviado al collector")
```

---

## ⚙️ Configuración Avanzada

### Multi-tenancy con API Keys

```yaml
extensions:
  bearertoken:
    scheme: "Bearer"
    tokens:
      - "customer-a-secret-token"
      - "customer-b-secret-token"

receivers:
  otlp:
    protocols:
      grpc:
        auth:
          authenticator: bearertoken
```

### Rate Limiting por Cliente

```yaml
processors:
  transform:
    metric_statements:
      - context: metric
        statements:
          # Rate limit 10k spans/s por customer
          - set(attributes["rate_limited"], true) where resource.attributes["customer.id"] == "customer-a" and rate(metric.count) > 10000
```

### Exportación Condicional

```yaml
processors:
  routing:
    from_attribute: customer.tier
    table:
      - value: premium
        exporters: [prometheus, cassandra]
      - value: basic
        exporters: [prometheus]
```

---

## 📈 Dimensionamiento

### Para 100 clientes con 500 nodos:

**Specs recomendadas:**
- **CPU**: 8-16 cores
- **RAM**: 16-32 GB
- **Network**: 10 Gbps NIC
- **Storage**: 50 GB SSD (para buffers temporales)

**Throughput esperado:**
- Spans: ~50,000 spans/s
- Métricas: ~100,000 samples/s
- Logs: ~10,000 events/s

**Latencia objetivo:**
- P50: < 10ms
- P95: < 50ms
- P99: < 100ms

### Escalamiento Horizontal

```
         ┌────────────────┐
         │ Load Balancer  │
         │  (round-robin) │
         └────────┬───────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
   ┌────▼───┐ ┌──▼────┐ ┌──▼────┐
   │Coll 1  │ │Coll 2 │ │Coll 3 │
   └────┬───┘ └───┬───┘ └───┬───┘
        │         │         │
        └─────────┼─────────┘
                  │
         ┌────────▼───────┐
         │  Prometheus    │
         │  Cassandra     │
         └────────────────┘
```

---

## 🔐 Seguridad

### TLS/SSL

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        tls:
          cert_file: /certs/collector.crt
          key_file: /certs/collector.key
          client_ca_file: /certs/ca.crt
```

### Network Policies (Kubernetes)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: otel-collector-policy
spec:
  podSelector:
    matchLabels:
      app: otel-collector
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: customer-agents
      ports:
      - protocol: TCP
        port: 4317
```

---

## 📚 Referencias

- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [Collector Configuration Reference](https://opentelemetry.io/docs/collector/configuration/)
- [Processor Reference](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor)
- [Exporter Reference](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter)

---

## 🎯 Checklist de Deployment

- [ ] Configuración YAML validada
- [ ] Puertos 4317/4318 accesibles desde agentes
- [ ] Prometheus configurado para scrappear puerto 8889
- [ ] Health check respondiendo en puerto 13133
- [ ] Memory limits configurados adecuadamente
- [ ] Filtro de multi-tenancy habilitado
- [ ] Exportadores configurados (Prometheus, Cassandra)
- [ ] Alertas configuradas en Prometheus
- [ ] Dashboard en Grafana creado
- [ ] Logs siendo recolectados
- [ ] Backups de configuración realizados

---

**Versión**: 1.0.0
**Última actualización**: Octubre 31, 2025
