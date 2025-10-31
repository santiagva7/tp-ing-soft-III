# Sistema de Monitoreo Multi-tenant con OpenTelemetry

## 📋 Visión General

Sistema de monitoreo de infraestructura como servicio (SaaS) que permite a múltiples clientes tercerizar la administración y observabilidad de sus nodos mediante OpenTelemetry, con almacenamiento híbrido (Prometheus + Cassandra) y visualización centralizada en Grafana.

### Propuesta de Valor

Ofrecer a empresas una **solución completa de observabilidad** sin la complejidad de mantener su propia infraestructura de monitoreo:
- ✅ **Instalación simple**: Un agente ligero en Go por nodo
- ✅ **Visibilidad en tiempo real**: CPU, RAM, latencia, trazas distribuidas
- ✅ **Alertas proactivas**: Detección automática de problemas
- ✅ **Dashboard multi-tenant**: Cada cliente ve solo sus nodos
- ✅ **Retención histórica**: 30 días hot + 2 años cold storage
- ✅ **SLA garantizado**: Tracking automático de uptime

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INFRAESTRUCTURA DE CLIENTES                       │
│                     (Nodos Remotos - Miles)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Cliente A - Nodo 1          Cliente A - Nodo 2    Cliente B ...    │
│  ┌─────────────────────┐    ┌─────────────────────┐                │
│  │  Agente Go + SDK    │    │  Agente Go + SDK    │                │
│  │  OpenTelemetry      │    │  OpenTelemetry      │                │
│  │                     │    │                     │                │
│  │  📊 Genera:         │    │  📊 Genera:         │                │
│  │  - Métricas (CPU,   │    │  - Métricas         │                │
│  │    RAM, disco)      │    │  - Trazas           │                │
│  │  - Trazas           │    │  - Logs             │                │
│  │  - Logs             │    │                     │                │
│  │                     │    │                     │                │
│  │  🏥 Expone:         │    │  🏥 Expone:         │                │
│  │  GET /health        │    │  GET /health        │                │
│  │  (estado del nodo)  │    │  (estado del nodo)  │                │
│  │                     │    │                     │                │
│  └──────────┬──────────┘    └──────────┬──────────┘                │
│             │                           │                           │
│             │ OTLP (gRPC)              │ OTLP (gRPC)               │
│             │ Telemetría tiempo real   │ Telemetría tiempo real    │
└─────────────┼───────────────────────────┼───────────────────────────┘
              │                           │
              │      Internet / VPN       │
              │                           │
┌─────────────┼───────────────────────────┼───────────────────────────┐
│             │  TU INFRAESTRUCTURA CENTRAL (Proveedor SaaS)          │
│             │                           │                           │
│             └───────────┬───────────────┘                           │
│                         │                                            │
│                ┌────────▼────────┐                                   │
│                │  Collector      │                                   │
│                │  OpenTelemetry  │                                   │
│                │  (Dispatcher)   │                                   │
│                └────────┬────────┘                                   │
│                         │                                            │
│            ┌────────────┴────────────┐                               │
│            │                         │                               │
│    ┌───────▼────────┐        ┌──────▼───────────┐                  │
│    │   HOT PATH     │        │   COLD PATH      │                  │
│    │   Prometheus   │        │   Cassandra      │                  │
│    │                │        │   Cluster        │                  │
│    │  - 30 días     │        │                  │                  │
│    │  - Queries     │        │  - 1-2 años      │                  │
│    │    rápidas     │        │  - Queries       │                  │
│    │    (50-200ms)  │        │    lentas        │                  │
│    │  - In-memory   │        │    (500-2000ms)  │                  │
│    └───────┬────────┘        │  - Distributed   │                  │
│            │                 │  - 3+ nodos      │                  │
│            │                 └──────┬───────────┘                  │
│            │                        │                               │
│            └────────────┬───────────┘                               │
│                         │                                            │
│                ┌────────▼────────┐                                   │
│                │    Grafana      │                                   │
│                │  (Multi-tenant) │                                   │
│                │                 │                                   │
│                │  Query Router:  │                                   │
│                │  < 30d → Prom   │                                   │
│                │  > 30d → Cass   │                                   │
│                └─────────────────┘                                   │
│                         │                                            │
│                         ▼                                            │
│            ┌────────────────────────┐                                │
│            │  Tu Dashboard SaaS     │                                │
│            │  - Lista de clientes   │                                │
│            │  - Estado de nodos 🟢🔴│                                │
│            │  - Métricas en vivo    │                                │
│            │  - Alertas             │                                │
│            └────────────────────────┘                                │
│                         ▲                                            │
│                         │                                            │
│                ┌────────┴────────┐                                   │
│                │   Prometheus    │                                   │
│                │   (Scraper)     │                                   │
│                │                 │                                   │
│                │  Scrappea /health de cada agente                    │
│                │  cada 30s para detectar nodos caídos                │
│                └─────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flujos de Datos

### 1. **Telemetría en Tiempo Real (gRPC/OTLP)**

```
Propósito: Métricas de negocio y rendimiento del nodo

┌─────────────────┐
│  Agente (Nodo)  │
│                 │
│  SDK genera:    │
│  - CPU: 75%     │
│  - RAM: 8.5GB   │
│  - Disco: 80%   │
│  - Latencia: 45ms│
└────────┬────────┘
         │
         │ OTLP (gRPC - Puerto 4317)
         │ Push continuo
         │ Alta frecuencia (cada 15s)
         │ Payload: Kilobytes/segundo
         │
         ▼
┌─────────────────┐
│   Collector     │
│   (Procesa)     │
└────────┬────────┘
         │
         ├────────────────────┐
         │                    │
         ▼                    ▼
┌─────────────┐      ┌───────────────┐
│ Prometheus  │      │  Cassandra    │
│ (Hot - 30d) │      │  (Cold - 2y)  │
└─────────────┘      └───────────────┘
         │                    │
         └─────────┬──────────┘
                   │
                   ▼
           ┌──────────────┐
           │   Grafana    │
           │  Dashboards  │
           └──────────────┘
```

**Características:**
- **Dirección**: Agente → Collector (push model)
- **Protocolo**: gRPC (OTLP)
- **Frecuencia**: Continua (cada 15 segundos)
- **Contenido**: Métricas, trazas, logs de la aplicación
- **Persistencia**: Prometheus (30d) + Cassandra (2 años)

---

### 2. **Health Checks (HTTP)**

```
Propósito: Estado del agente y conectividad

┌─────────────────┐
│  Prometheus     │
│  (Scraper)      │
└────────┬────────┘
         │
         │ HTTP GET /health (Puerto 8080)
         │ Pull cada 30s
         │ Payload: ~1 KB
         │
         ▼
┌─────────────────┐
│  Agente (Nodo)  │
│                 │
│  Responde:      │
│  {              │
│   "status": "healthy",│
│   "collector_reachable": true,│
│   "buffer_usage": "25%",│
│   "uptime": "72h"│
│  }              │
└─────────────────┘
```

**Características:**
- **Dirección**: Prometheus → Agente (pull model)
- **Protocolo**: HTTP/JSON
- **Frecuencia**: Cada 30 segundos
- **Contenido**: Estado del agente, conectividad, uso de buffer
- **Persistencia**: Prometheus (30d)
- **Uso**: Alertas, dashboard de estado, SLA tracking

---

## 📁 Estructura del Proyecto

```
tp-ing-soft-III/
├── README.md                          # Este archivo
├── services/
│   ├── agent/                         # Agente que va en nodos de clientes
│   │   ├── README.md                  # Documentación del agente
│   │   ├── docker-compose.yaml        # Deployment del agente
│   │   ├── otel-agent-config.yaml     # Configuración OpenTelemetry
│   │   └── main.go                    # (Futuro) Código del agente
│   │
│   ├── collector/                     # Collector central (tu infra)
│   │   ├── README.md                  # Documentación del collector
│   │   ├── docker-compose.yaml        # Deployment del collector
│   │   ├── otel-collector-config.yaml # Configuración del collector
│   │   ├── example.py                 # Cliente ejemplo que envía datos
│   │   ├── test_collector.py          # Tests del collector
│   │   └── requirements.txt           # Dependencias Python
│   │
│   ├── storage/                       # Capa de almacenamiento híbrido
│   │   ├── README.md                  # Documentación del storage
│   │   ├── docker-compose.yaml        # (Futuro) Prometheus + Cassandra
│   │   ├── prometheus/
│   │   │   └── prometheus.yml         # (Futuro) Config Prometheus
│   │   ├── cassandra/
│   │   │   └── schema.cql             # (Futuro) Esquema de tablas
│   │   └── grafana/
│   │       └── dashboards/            # (Futuro) Dashboards preconfigured
│   │
│   └── monitor/                       # Dashboard de observabilidad
│       ├── README.md                  # Documentación del dashboard
│       ├── docker-compose.yaml        # (Futuro) Grafana + configs
│       ├── grafana/
│       │   ├── dashboards/            # (Futuro) Dashboards JSON
│       │   ├── datasources/           # (Futuro) Datasources config
│       │   └── alerting/              # (Futuro) Alerting rules
│       └── prometheus/
│           ├── prometheus.yml         # (Futuro) Prometheus config
│           └── alerts/                # (Futuro) Alert rules
│
└── docs/                              # (Futuro) Documentación adicional
    ├── architecture.md
    ├── deployment.md
    └── api.md
```

---

## 🎯 Componentes Clave

### 1. **Agente (Go + OpenTelemetry SDK)**

**Ubicación**: `services/agent/`

**Descripción**: Aplicación ligera en Go que se despliega en cada nodo del cliente.

**Responsabilidades**:
- ✅ Generar telemetría mediante SDK de OpenTelemetry
- ✅ Instrumentar aplicaciones del cliente automáticamente
- ✅ Exportar datos vía OTLP al Collector central
- ✅ Exponer endpoint `/health` para monitoreo de estado
- ✅ Etiquetar datos con `customer_id`, `node_id`, `environment`
- ✅ Bufferear datos en memoria ante fallos del Collector

**Características técnicas**:
- Lenguaje: Go
- SDK: `go.opentelemetry.io/otel`
- Protocolos: gRPC (OTLP), HTTP (health checks)
- Puertos: 4317 (OTLP gRPC saliente), 8080 (HTTP /health entrante)
- Recursos: ~50-100 MB RAM, mínimo overhead CPU

**Ver**: [services/agent/README.md](services/agent/README.md)

---

### 2. **Collector (OpenTelemetry Collector)**

**Ubicación**: `services/collector/`

**Descripción**: Componente central que recibe telemetría de todos los agentes y la distribuye a los sistemas de almacenamiento.

**Responsabilidades**:
- ✅ Recibir datos OTLP de múltiples agentes
- ✅ Procesar y enriquecer datos (batching, filtering)
- ✅ Validar multi-tenancy (cada span tiene `customer_id`)
- ✅ Exportar a Prometheus (hot path)
- ✅ Exportar a Cassandra (cold path)
- ✅ Exponer métricas propias y health checks

**Características técnicas**:
- Imagen: `otel/opentelemetry-collector-contrib`
- Receivers: OTLP (gRPC, HTTP)
- Processors: batch, attributes, filter, memory_limiter
- Exporters: prometheus, otlphttp/cassandra
- Puertos: 4317 (gRPC), 4318 (HTTP), 8889 (Prometheus metrics), 13133 (health)

**Ver**: [services/collector/README.md](services/collector/README.md)

---

### 3. **Storage Layer (Prometheus + Cassandra)**

**Ubicación**: `services/storage/`

**Descripción**: Arquitectura híbrida de almacenamiento que combina hot storage (Prometheus) para queries rápidas y cold storage (Cassandra) para retención a largo plazo.

#### 3.1 **Prometheus (Hot Storage)**

**Propósito**: Datos recientes para dashboards en tiempo real

**Características**:
- ⚡ Latencia ultra-baja: 50-200ms
- 📊 Retención: 30 días
- 🎯 Optimizado para series temporales
- 🔔 Alerting integrado (Alertmanager)
- 📈 PromQL para queries complejas

**Casos de uso**:
- Dashboards en tiempo real
- Alertas críticas (< 5 minutos)
- Troubleshooting activo
- Análisis de últimas 24-72 horas

#### 3.2 **Cassandra (Cold Storage)**

**Propósito**: Datos históricos para análisis y compliance

**Características**:
- 💾 Retención masiva: 1-2 años
- 🌐 Distribuido: 3+ nodos con replicación
- 📈 Escalabilidad horizontal
- 🔒 Durabilidad: Sin pérdida de datos
- ⚡ Write-optimized: Alto throughput

**Casos de uso**:
- Análisis histórico (> 30 días)
- Reportes mensuales/anuales
- Compliance y auditoría
- Capacity planning
- Forensics post-mortem

#### 3.3 **Query Router**

Lógica en Grafana que enruta queries automáticamente:
- **< 30 días**: Query a Prometheus (rápido)
- **> 30 días**: Query a Cassandra (lento pero tiene datos)

**Ver**: [services/storage/README.md](services/storage/README.md)

---

### 4. **Grafana (Visualización Multi-tenant)**

**Ubicación**: `services/monitor/`

**Descripción**: Dashboard centralizado con separación por cliente.

**Características**:
- 📊 Dashboards predefinidos por tipo de nodo
- 🔐 Multi-tenancy: Cada cliente ve solo sus nodos
- 🎨 Visualizaciones en tiempo real
- 🔔 Integración con Alertmanager
- 📈 Query routing automático (Prometheus vs Cassandra)

**Paneles principales**:
1. **Vista Global**: Lista de todos los clientes y estado de nodos
2. **Vista por Cliente**: Métricas detalladas de todos sus nodos
3. **Vista por Nodo**: Drill-down de un nodo específico
4. **Alertas**: Dashboard de alertas activas
5. **Infraestructura (SRE)**: Vista técnica del sistema completo

**Ver**: [services/monitor/README.md](services/monitor/README.md)

---

## 🔀 Escenarios de Operación

### ✅ Operación Normal

```
1. Agente genera métricas
   └─ CPU: 45%, RAM: 8GB, Latencia: 25ms

2. Agente envía vía OTLP al Collector
   └─ gRPC: collector.tuempresa.com:4317

3. Collector recibe y despacha
   ├─ Prometheus: Escribe métricas (hot)
   └─ Cassandra: Escribe métricas (cold)

4. Prometheus scrappea /health del agente
   └─ Respuesta: 200 OK {"status": "healthy"}

5. Usuario consulta Grafana
   ├─ Rango: últimas 24h → Query a Prometheus (150ms)
   └─ Muestra gráfica en tiempo real
```

---

### ⚠️ Escenario: Collector Caído

```
1. Agente intenta enviar OTLP
   └─ Error: connection refused

2. SDK de Go maneja el fallo
   ├─ Reintenta con backoff exponencial
   ├─ Buffer se llena gradualmente
   └─ Status: "degraded" (funciona pero sin enviar)

3. Prometheus scrappea /health
   └─ Respuesta: 200 OK {
       "status": "degraded",
       "collector_reachable": false,
       "buffer_usage": "75%"
     }

4. Alerta automática activada
   ├─ Severity: warning
   └─ Mensaje: "Agente no puede alcanzar Collector"

5. TÚ recibes alerta y reinicia Collector

6. Collector vuelve online

7. Agente reconecta y vacía buffer
   └─ Status: "healthy"
```

---

### 🔴 Escenario: Nodo del Cliente Caído

```
1. Nodo del cliente se apaga (ej: mantenimiento)

2. Prometheus intenta scrappear /health
   └─ Error: timeout (no responde)

3. Después de 3 intentos fallidos (2 minutos)
   └─ Prometheus marca: up{node="cliente-a-nodo-1"} = 0

4. Alerta activada
   ├─ Severity: critical
   └─ Mensaje: "Nodo cliente-a-nodo-1 está caído"

5. Notificaciones enviadas
   ├─ Email al cliente
   ├─ Slack channel
   └─ Dashboard muestra: 🔴 cliente-a-nodo-1: DOWN

6. Cliente ve alerta y reinicia nodo

7. Nodo vuelve online

8. Prometheus scrappea /health exitosamente
   └─ up{node="cliente-a-nodo-1"} = 1

9. Dashboard actualiza: 🟢 cliente-a-nodo-1: HEALTHY
```

---

## 📊 Flujo de Datos Multi-tenant

### Etiquetado de Datos

Todos los datos llevan labels de identificación:

```go
// En el agente
resource := resource.NewWithAttributes(
    semconv.SchemaURL,
    semconv.ServiceNameKey.String("customer-app"),
    attribute.String("customer.id", "cliente-a"),
    attribute.String("customer.name", "Empresa XYZ"),
    attribute.String("node.id", "prod-web-01"),
    attribute.String("node.region", "us-east-1"),
    attribute.String("environment", "production"),
)
```

### Query en Grafana

```promql
# CPU de todos los nodos de cliente-a
avg(system_cpu_usage{customer_id="cliente-a"}) by (node_id)

# Nodos caídos de cliente-b
up{customer_id="cliente-b"} == 0

# Latencia promedio por cliente
avg(http_request_duration_seconds{customer_id="$customer"})
```

### Aislamiento de Datos

- **Grafana**: Variables de dashboard filtran por `customer_id`
- **Collector**: Procesador `filter` valida presencia de `customer_id`
- **Cassandra**: Partitioning key incluye `customer_id`
- **Prometheus**: Labels permiten queries segregadas

---

## 🚀 Quick Start

### Prerrequisitos

- Docker & Docker Compose
- Go 1.21+ (para desarrollar el agente)
- Acceso a red entre nodos de clientes y tu infraestructura

### Deployment Mínimo

#### 1. Levantar Collector Central

```bash
cd services/collector
docker-compose up -d
```

Verifica que esté corriendo:
```bash
curl http://localhost:13133/health
# Debe responder: 200 OK
```

#### 2. Desplegar Agente en Nodo del Cliente

```bash
cd services/agent
# Editar docker-compose.yaml con la IP/dominio de tu Collector
docker-compose up -d
```

Verifica que esté corriendo:
```bash
curl http://localhost:8080/health
# Debe responder: {"status": "healthy", ...}
```

#### 3. Levantar Storage Layer

```bash
cd services/storage
docker-compose up -d
```

Verifica Prometheus:
```bash
curl http://localhost:9090/-/healthy
```

Verifica Cassandra:
```bash
docker exec -it cassandra-cold-1 nodetool status
```

#### 4. Acceder a Grafana

```
URL: http://localhost:3000
User: admin
Pass: admin
```

Importa dashboards desde `services/storage/grafana/dashboards/`

---

## 📈 Monitoreo del Sistema

### Métricas del Collector

```promql
# Tasa de ingesta de spans
rate(otelcol_receiver_accepted_spans[5m])

# Latencia del collector
histogram_quantile(0.95, otelcol_processor_batch_batch_send_duration_bucket)

# Errores de exportación
rate(otelcol_exporter_send_failed_spans[5m])
```

### Métricas de los Agentes

```promql
# Nodos activos por cliente
count(up{job="customer-agents"} == 1) by (customer_id)

# Uso de CPU promedio
avg(system_cpu_usage) by (customer_id, node_id)

# Agentes con buffer saturado
agent_buffer_usage_percent > 80
```

### Health Checks

```promql
# Nodos DOWN
up{job="customer-agents"} == 0

# Agentes con problemas de conectividad
agent_collector_reachable == 0
```

---

## 🔔 Alertas Recomendadas

### Alertas Críticas

```yaml
groups:
  - name: critical_alerts
    interval: 30s
    rules:
      # Nodo caído
      - alert: CustomerNodeDown
        expr: up{job="customer-agents"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Nodo {{ $labels.node_id }} del cliente {{ $labels.customer_id }} está caído"
      
      # Collector caído
      - alert: CollectorDown
        expr: up{job="otel-collector"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Collector central está caído - sin ingesta de datos"
      
      # Buffer del agente saturado
      - alert: AgentBufferSaturated
        expr: agent_buffer_usage_percent > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Buffer del agente {{ $labels.node_id }} al {{ $value }}%"
```

### Alertas de Warning

```yaml
      # Agente no puede alcanzar Collector
      - alert: AgentCollectorUnreachable
        expr: agent_collector_reachable == 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Agente {{ $labels.node_id }} no puede conectar al Collector"
      
      # CPU alta en nodo
      - alert: HighCPUUsage
        expr: system_cpu_usage > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "CPU alta en {{ $labels.node_id }}: {{ $value }}%"
      
      # Memoria alta
      - alert: HighMemoryUsage
        expr: system_memory_usage_percent > 90
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Memoria alta en {{ $labels.node_id }}: {{ $value }}%"
```

---

## 🔒 Seguridad y Multi-tenancy

### Aislamiento de Datos

1. **Nivel de Agente**: Cada agente etiqueta datos con `customer_id`
2. **Nivel de Collector**: Filtro rechaza datos sin `customer_id`
3. **Nivel de Storage**: Cassandra usa `customer_id` como partition key
4. **Nivel de Visualización**: Grafana filtra por organización/usuario

### Autenticación y Autorización

```yaml
# En el Collector (futuro)
extensions:
  bearertoken:
    scheme: "Bearer"
    token: "${CUSTOMER_API_TOKEN}"

receivers:
  otlp:
    protocols:
      grpc:
        auth:
          authenticator: bearertoken
```

### Encriptación

- **En tránsito**: TLS para OTLP y health checks
- **En reposo**: Encriptación de volúmenes Cassandra
- **Secrets**: Variables de entorno, no hardcoded

---

## 📊 Capacidad y Escalamiento

### Dimensionamiento

#### Para 100 clientes con 500 nodos totales:

**Agentes** (por nodo):
- CPU: ~0.1 core
- RAM: ~50-100 MB
- Network: ~10 KB/s saliente

**Collector** (centralizado):
- CPU: 8-16 cores
- RAM: 16-32 GB
- Network: 5-10 MB/s entrante
- Escalamiento: Horizontal (múltiples collectors con load balancer)

**Prometheus** (hot storage):
- CPU: 4-8 cores
- RAM: 16-32 GB
- Disco: 500 GB - 1 TB SSD
- Escalamiento: Vertical + Thanos para HA

**Cassandra** (cold storage):
- CPU: 8-16 cores por nodo
- RAM: 32-64 GB por nodo
- Disco: 1-4 TB SSD por nodo
- Nodos: Mínimo 3, escala horizontalmente

**Grafana**:
- CPU: 2-4 cores
- RAM: 4-8 GB
- Escalamiento: Múltiples instancias con shared database

### Proyección de Crecimiento

| Clientes | Nodos | Métricas/s | Collectors | Cassandra Nodes | Costo Mensual (AWS) |
|----------|-------|------------|------------|-----------------|---------------------|
| 10       | 50    | 5,000      | 1          | 3               | ~$1,500             |
| 50       | 250   | 25,000     | 2          | 3               | ~$3,500             |
| 100      | 500   | 50,000     | 3          | 5               | ~$7,000             |
| 500      | 2,500 | 250,000    | 10         | 9               | ~$25,000            |
| 1,000    | 5,000 | 500,000    | 20         | 15              | ~$50,000            |

---

## 🛠️ Desarrollo

### Estructura de Branches

```
main          → Producción estable
develop       → Integración continua
feature/*     → Nuevas funcionalidades
bugfix/*      → Corrección de bugs
hotfix/*      → Fixes urgentes en producción
```

### Testing

```bash
# Tests del Collector
cd services/collector
python -m pytest test_collector.py

# Tests del Agente (futuro)
cd services/agent
go test ./...

# Tests de integración (futuro)
cd tests/integration
./run_integration_tests.sh
```

### Contribuir

1. Fork el repositorio
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -am 'Agrega nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

---

## 📚 Documentación Adicional

- **[Agent README](services/agent/README.md)**: Detalles del agente Go con SDK OpenTelemetry
- **[Collector README](services/collector/README.md)**: Configuración del collector central
- **[Storage README](services/storage/README.md)**: Arquitectura híbrida de almacenamiento (Prometheus + Cassandra)
- **[Monitor README](services/monitor/README.md)**: Dashboard de observabilidad multi-tenant con Grafana
- **[OpenTelemetry Docs](https://opentelemetry.io/docs/)**: Documentación oficial
- **[Prometheus Docs](https://prometheus.io/docs/)**: Documentación de Prometheus
- **[Cassandra Docs](https://cassandra.apache.org/doc/)**: Documentación de Cassandra
- **[Grafana Docs](https://grafana.com/docs/)**: Documentación de Grafana

---

## 🎯 Roadmap

### Fase 1: MVP (Actual)
- [x] Arquitectura base definida
- [x] Documentación completa
- [ ] Collector funcional
- [ ] Agente básico en Go
- [ ] Prometheus configurado
- [ ] Dashboard básico en Grafana

### Fase 2: Funcionalidad Core (Q1 2026)
- [ ] Cassandra cluster operacional
- [ ] Query routing automático
- [ ] Sistema de alertas completo
- [ ] Autenticación multi-tenant
- [ ] API REST para gestión de clientes

### Fase 3: Enterprise Features (Q2 2026)
- [ ] Downsampling automático
- [ ] Backup y disaster recovery
- [ ] SLA tracking y reporting
- [ ] Facturación automática
- [ ] Portal de clientes (self-service)

### Fase 4: Advanced (Q3 2026)
- [ ] Machine Learning para anomaly detection
- [ ] Auto-scaling de Collector y Cassandra
- [ ] Multi-región geográfica
- [ ] Compliance certifications (SOC2, ISO27001)

---

## 🤝 Equipo

- **Repository Owner**: [santiagva7](https://github.com/santiagva7)
- **Contributors**: Ver [Contributors](../../graphs/contributors)

---

## 📄 Licencia

Este proyecto es privado y propiedad del equipo de desarrollo.

---

## 💡 Conceptos Clave

### ¿Por qué OpenTelemetry?

- **Vendor-neutral**: No lock-in con un proveedor específico
- **Estándar de industria**: Adoptado por CNCF
- **Observabilidad unificada**: Trazas + Métricas + Logs en un solo SDK
- **Ecosistema rico**: Integración con 100+ tecnologías
- **Instrumentación automática**: Muchos frameworks ya soportados

### ¿Por qué Arquitectura Híbrida (Prometheus + Cassandra)?

- **Best of both worlds**:
  - Prometheus: Queries ultra-rápidas para tiempo real
  - Cassandra: Retención masiva para histórico
- **Optimización de costos**: No pagar por SSD rápido para datos viejos
- **Compliance**: Retención de 2 años sin romper el banco
- **Escalabilidad**: Prometheus vertical, Cassandra horizontal

### ¿Por qué Doble Flujo (OTLP + /health)?

- **OTLP (gRPC)**: Telemetría de negocio (CPU, RAM, latencia)
  - Push model: Agente envía continuamente
  - Alto volumen de datos
  
- **/health (HTTP)**: Estado del agente mismo
  - Pull model: Prometheus scrappea
  - Bajo volumen, alta confiabilidad
  - Independiente del Collector (detecta problemas de red)

---

## 🔍 Troubleshooting

### Agente no puede conectar al Collector

```bash
# Verificar conectividad de red
curl -v telnet://collector.tuempresa.com:4317

# Check logs del agente
docker logs otel-agent

# Verificar firewall/security groups
# Debe permitir: puerto 4317 (gRPC) y 8080 (HTTP)
```

### Collector no recibe datos

```bash
# Check logs del Collector
docker logs otel-collector

# Verificar health
curl http://localhost:13133/health

# Ver métricas internas
curl http://localhost:8888/metrics | grep otelcol_receiver
```

### Prometheus no scrappea agentes

```bash
# Ver targets en Prometheus
# http://localhost:9090/targets

# Verificar configuración
docker exec prometheus cat /etc/prometheus/prometheus.yml

# Test manual de health endpoint
curl http://<ip-agente>:8080/health
```

### Cassandra nodo caído

```bash
# Estado del cluster
docker exec cassandra-1 nodetool status

# Reiniciar nodo
docker restart cassandra-2

# Reparar datos después de caída
docker exec cassandra-2 nodetool repair -pr observability
```

---

## 📞 Soporte

Para reportar issues o hacer preguntas:
- **Issues**: [GitHub Issues](../../issues)
- **Discussions**: [GitHub Discussions](../../discussions)
- **Email**: soporte@tuempresa.com (cuando esté operativo)

---

**Última actualización**: Octubre 31, 2025
**Versión**: 1.0.0-MVP

