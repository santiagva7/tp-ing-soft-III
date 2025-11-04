# Pulse Ops Node - Next.js Agent

Agente de monitoreo construido con Next.js 16 y OpenTelemetry para recolectar métricas de sistema (CPU, RAM).

**Arquitectura de cluster distribuido**: El agente tiene un **nodo Cassandra local** que:
- **Se une al cluster central** como miembro (rack4)
- **Recibe replicaciones automáticas** vía Gossip Protocol
- **Permite escrituras locales** que se sincronizan automáticamente
- **Alta disponibilidad** con RF=3 (datos en 3+ nodos siempre)

## 🏗️ Arquitectura del Agente

### Flujo de datos completo (cluster distribuido)

```
┌─────────────────────────────────────────────────────────────────────┐
│ AGENT MACHINE (Edge Node)                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    OTLP/gRPC (4317)   ┌──────────────────┐  │
│  │  Next.js App     │───────────────────────>│ Local Collector  │  │
│  │  (pulse-ops-node)│    localhost:4317      │  (OTel Collector)│  │
│  └──────────────────┘                        └────────┬─────────┘  │
│   • CPU metrics                                       │             │
│   • RAM metrics                                       │             │
│   • Customer labels                                   │             │
│                                                       │             │
│                                            OTLP/gRPC  │             │
│                                            (primary)  │             │
│                                                       │             │
│                                                       ▼             │
│                                          ┌────────────────────┐    │
│                                          │ Cassandra Agent    │    │
│                                          │ (rack4)            │    │
│                                          │ • Cluster member   │    │
│                                          │ • Seeds: 1,2,3     │    │
│                                          │ • Port: 9043       │    │
│                                          └─────────┬──────────┘    │
│                                                    │                │
│                                                    │ Gossip         │
└────────────────────────────────────────────────────┼────────────────┘
                                                     │ Protocol
                                                     │ (Replication)
                                                     ▼
                              ┌─────────────────────────────────────┐
                              │ CENTRAL INFRASTRUCTURE              │
                              ├─────────────────────────────────────┤
                              │  ┌──────────────────┐              │
                              │  │ Central Collector│              │
                              │  │  (port 4317)     │              │
                              │  └────────┬─────────┘              │
                              │           │                         │
                              │           ▼                         │
                              │  ┌──────────────────────────────┐  │
                              │  │ Cassandra Cluster            │  │
                              │  │ ┌────────┐  ┌────────┐       │  │
                              │  │ │ Node 1 │  │ Node 2 │       │  │
                              │  │ │(rack1) │  │(rack2) │       │  │
                              │  │ └───┬────┘  └────┬───┘       │  │
                              │  │     │ Gossip     │           │  │
                              │  │     └──────┬─────┘           │  │
                              │  │            │                 │  │
                              │  │       ┌────┴────┐            │  │
                              │  │       │ Node 3  │            │  │
                              │  │       │(rack3)  │            │  │
                              │  │       └────┬────┘            │  │
                              │  │            │                 │  │
                              │  │            │ Gossip +        │  │
                              │  │            │ Replication     │  │
                              │  │            │                 │  │
                              │  │       ┌────▼──────────┐      │  │
                              │  │       │cassandra-agent│      │  │
                              │  │       │    (rack4)    │◄─────┼──┤
                              │  │       └───────────────┘      │  │
                              │  │       Connected to cluster   │  │
                              │  └──────────────────────────────┘  │
                              │                                     │
                              │  Keyspace: pulseops                │
                              │  RF=3 (NetworkTopologyStrategy)    │
                              │  Datos en 3+ nodos siempre         │
                              └─────────────────────────────────────┘

NOTA: Cassandra Agent ES MIEMBRO del cluster central
      Replicación automática vía Gossip Protocol (RF=3)
```

### Comportamiento en diferentes escenarios

#### ✅ Escenario 1: Todo conectado (normal)

1. **App Next.js** → métricas → **Collector Local** (localhost:4317)
2. **Collector Local** → **Central Collector** (primary path) ✅
3. **Central Collector** → escribe a **Cassandra Cluster** (cualquier nodo)
4. **Cassandra Gossip** replica automáticamente a todos los nodos (incluido agente)
5. Resultado: Datos en **3+ nodos** (RF=3), incluyendo el nodo del agente

#### 🔌 Escenario 2: Central offline (red desconectada)

1. **App Next.js** → métricas → **Collector Local** ✅
2. **Collector Local** intenta exportar a **Central Collector** ❌ (falla conexión)
3. **Persistent queue** guarda métricas en disco (retry automático)
4. **Collector Local** puede escribir localmente a **Cassandra Agent** (opcional)
5. Cuando la conexión vuelve:
   - **Persistent queue** envía métricas acumuladas al central
   - **Central** escribe al cluster
   - **Gossip** replica a todos los nodos (sincronización automática)
6. Resultado: **Consistencia eventual** garantizada por Cassandra

#### 💾 Escenario 3: Nodo agente offline (falla local)

1. **App Next.js** → métricas → **Collector Local** ✅
2. **Collector Local** → **Central Collector** ✅ (path siempre disponible)
3. **Central** → escribe a **Cassandra Cluster** (nodos centrales)
4. **Nodo agente caído** → NO recibe replicaciones temporalmente
5. Cuando el agente vuelve:
   - **Gossip Protocol** detecta el nodo
   - **Hinted handoff** y **read repair** sincronizan datos perdidos
   - **Consistencia eventual** restaurada automáticamente
6. Resultado: Sin pérdida de datos, sincronización automática

### Ventajas de esta arquitectura

| Ventaja | Descripción |
|---------|-------------|
| **🛡️ Alta disponibilidad** | RF=3 + 1 nodo agente = 4 nodos con datos completos |
| **🔄 Replicación automática** | Gossip Protocol sincroniza todos los nodos sin configuración manual |
| **⚡ Lecturas locales** | El agente puede leer de su nodo local sin latencia de red |
| **📊 Consistencia eventual** | Cassandra garantiza sincronización automática (hinted handoff, read repair) |
| **🎯 Distribución geográfica** | Nodos agente en edge + cluster central = arquitectura multi-región natural |
| **📈 Escalabilidad** | Agregar agentes = agregar nodos al cluster (scaling horizontal) |
| **💾 Sin doble escritura** | Una sola escritura se replica automáticamente (no hay duplicados) |

### Componentes del agente

1. **Next.js App** (`pulse-ops-node`):
   - Genera métricas de sistema (CPU, RAM)
   - Envía vía OpenTelemetry SDK a `localhost:4317`
   
2. **Local Collector** (`otel-collector`):
   - Recibe OTLP/gRPC en puerto 4317
   - Aplica procesamiento (batch, attributes, filters)
   - **Export primario**: Central Collector (con retry + persistent queue)

3. **Cassandra Agent Node**:
   - **Miembro del cluster** PulseOpsCluster (rack4)
   - **Seeds**: cassandra-1, cassandra-2, cassandra-3
   - **Replicación automática** vía Gossip Protocol
   - **Lecturas locales** rápidas para el agente
   - Puerto: 9043 (externo), 9042 (interno cluster)

3. **Cassandra Adapter** (solo en failover):
   - Recibe métricas del collector vía HTTP POST
   - Transforma a schema Cassandra (`pulseops.metrics`)
   - Inserta en Cassandra Agent Node

4. **Cassandra Agent Node** (standalone):
   - Nodo Cassandra **independiente** (NO cluster)
   - Almacena datos localmente (solo durante failover)
   - **SimpleStrategy, RF=1** (nodo único)
   - NO se replica al cluster central (son storages separados)

## 📋 Prerequisitos

- Node.js 18+
- Docker + Docker Compose
- **Cassandra Cluster** corriendo (ver `services/storage/cassandra/`)
- **OpenTelemetry Collector Central** corriendo (opcional si quieres modo standalone)

## 🚀 Inicio Rápido

### Opción 1: Desarrollo local (sin Docker)

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.local.example .env.local
# Editar .env.local con tus valores

# Desarrollo
npm run dev
```

**Nota**: En modo dev, la app envía a `localhost:4317`. Necesitas:
- Local Collector corriendo, o
- Cambiar `OTEL_EXPORTER_OTLP_ENDPOINT` para apuntar directamente al central

### Opción 2: Stack completo con Docker Compose (recomendado)

```bash
# 1. Levantar Cassandra Cluster (central)
cd ../../storage/cassandra
docker compose up -d

# 2. Levantar Cassandra Agent Node
cd ../../agent/cassandra
docker compose up -d

# 3. Levantar Local Collector + Adapter + App (TODO: crear compose completo)
cd ../pulse-ops-node
docker compose up -d

# Ver logs del agente
docker compose logs -f pulse-ops-node

# Ver logs del collector local
docker compose logs -f otel-collector-local
```

### Opción 3: Solo app en Docker (sin collector local)

```bash
# Build the image
docker build -t pulse-ops-node .

# Run pointing directly to central collector
docker run -p 3001:3001 \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4317 \
  -e OTEL_SERVICE_NAME=pulse-ops-node \
  -e CUSTOMER_ID=customer-123 \
  pulse-ops-node
```

**⚠️ Sin collector local = sin resiliencia offline**

## 📊 Métricas Recolectadas

- `system.cpu.percent` - Porcentaje de uso de CPU
- `system.memory.percent` - Porcentaje de uso de RAM

Las métricas se exportan cada **5 segundos** al OpenTelemetry Collector vía OTLP/gRPC.

## 🔧 Configuración

### Variables de entorno de la aplicación

Archivo `.env.local` (desarrollo) o variables en Docker Compose (producción):

```env
# OpenTelemetry - Apunta al collector LOCAL (no al central)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Identificación del servicio
OTEL_SERVICE_NAME=pulse-ops-node
CUSTOMER_ID=customer-123

# Entorno
NODE_ENV=production
```

### Configuración del Local Collector (TODO)

El collector local (`otel-collector-config.yaml`) debe tener **failover exporters**:

**Receivers**:
- `otlp`: gRPC en puerto 4317 (recibe de la app)

**Processors** (mismo que central):
- `batch`: Agrupa métricas (5000 metrics, 10s timeout)
- `attributes`: Agrega labels (customer_id, node_id)
- `resource`: Detecta hostname, OS, etc.

**Exporters con Failover**:
```yaml
exporters:
  # PRIMARY: Central Collector
  otlp/central:
    endpoint: http://host.docker.internal:4317
    tls:
      insecure: true
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 5m
    sending_queue:
      enabled: true
      num_consumers: 2
      queue_size: 5000
      storage: file_storage  # Persistent queue
  
  # FALLBACK: Cassandra Adapter (solo si central falla)
  otlphttp/cassandra-adapter:
    endpoint: http://cassandra-adapter:8080/metrics
    timeout: 5s

# File storage para persistent queue
extensions:
  file_storage:
    directory: /var/lib/otelcol/file_storage
    timeout: 10s

# Pipeline con failover
service:
  extensions: [file_storage]
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, attributes, resource]
      exporters: [otlp/central]  # Solo primary en pipeline normal
      
      # Nota: El failover a cassandra-adapter se activa mediante
      # configuración del exporter, NO en el pipeline.
      # OpenTelemetry NO tiene soporte nativo para failover exporters.
      # Alternativa: Usar 2 pipelines con routing processor.
```

**Implementación de Failover** (requiere configuración avanzada):

Opción A: Usar **routing processor** con health_check:
```yaml
processors:
  routing:
    from_attribute: fallback_mode  # Set by health_check
    table:
      - value: "true"
        exporters: [otlphttp/cassandra-adapter]
    default_exporters: [otlp/central]
```

Opción B: Usar **2 collectors** en cascade (más simple):
- Collector1: App → OTLP → file queue → Collector2
- Collector2: Lee queue → intenta central → si falla → Cassandra

**Recomendación**: Usar **Opción B** (2 collectors) por simplicidad.

### Cassandra Adapter (TODO)

Pequeño servicio HTTP que recibe métricas OTLP y escribe a Cassandra:

```typescript
// POST /metrics
{
  "resourceMetrics": [{
    "resource": { "attributes": [{"key": "customer.id", "value": "customer-123"}] },
    "scopeMetrics": [{
      "metrics": [{
        "name": "system.cpu.percent",
        "gauge": { "dataPoints": [{"timeUnixNano": "...", "asDouble": 45.5}] }
      }]
    }]
  }]
}
```

Transforma a:
```sql
INSERT INTO pulseops.metrics (node_id, metric_name, time_bucket, timestamp, value)
VALUES ('pulse-ops-node', 'system.cpu.percent', '2025-11-04', '2025-11-04 12:34:56', 45.5);
```

## 🧪 Verificar que Funciona

### Logs esperados en la app Next.js

Al ejecutar `npm run dev` o `docker compose up`:

```log
🚀 Inicializando OpenTelemetry...
✅ OpenTelemetry inicializado correctamente
   📡 Collector: http://localhost:4317
   🏷️  Service: pulse-ops-node
   👤 Customer: customer-123
📊 Registrando métricas del sistema...
✅ Métricas del sistema registradas (CPU, RAM)
[12:34:56] 📊 system.cpu.percent: 45.23%
[12:34:56] 📊 system.memory.percent: 68.91%
```

Cada **5 segundos** verás nuevos logs con valores actualizados.

### Verificar collector local recibe métricas

```bash
# Ver logs del collector local
docker compose logs -f otel-collector-local

# Deberías ver:
# 2025-11-04T12:34:56.123Z  info  exporterhelper/queued_retry.go  Exporting
# 2025-11-04T12:34:56.456Z  info  otlp/exporter.go  Sent metrics to central
```

### Verificar datos en Cassandra Agent

```bash
# Conectar al nodo Cassandra del agente
docker exec -it pulseops-agent-cassandra cqlsh

# Query reciente
SELECT * FROM pulseops.metrics 
WHERE node_id='pulse-ops-node' 
  AND metric_name='system.cpu.percent' 
  AND time_bucket='2025-11-04'
LIMIT 10;

# Deberías ver filas con timestamps recientes
```

### Verificar replicación al cluster central

```bash
# Conectar al nodo central
docker exec -it pulseops-db-1 cqlsh

# Misma query (datos deben estar replicados)
SELECT * FROM pulseops.metrics 
WHERE node_id='pulse-ops-node' 
  AND metric_name='system.cpu.percent' 
  AND time_bucket='2025-11-04'
LIMIT 10;
```

### Probar resiliencia (offline mode)

```bash
# 1. Detener el collector central
cd ../../../../collector
docker compose down

# 2. App sigue enviando al local collector
docker compose -f ../agent/pulse-ops-node/docker-compose.yml logs -f

# 3. Verificar que datos se guardan en Cassandra local
docker exec -it pulseops-agent-cassandra cqlsh -e "
  SELECT COUNT(*) FROM pulseops.metrics 
  WHERE node_id='pulse-ops-node' 
    AND metric_name='system.cpu.percent' 
    AND time_bucket='2025-11-04';
"

# 4. Reiniciar collector central
docker compose up -d

# 5. Ver logs: el collector local enviará datos acumulados (retry queue)
docker compose -f ../agent/pulse-ops-node/docker-compose.yml logs otel-collector-local
# Deberías ver: "Retrying batch send" y luego "Successfully sent"
```

## 🚀 Próximos Pasos (Implementación)

Para completar esta arquitectura, necesitamos crear:

### 1. Local Collector
- [ ] `services/agent/collector/config/otel-collector-config.yaml`
- [ ] `services/agent/collector/docker-compose.yml`
- [ ] Configurar receivers, processors, exporters (dual)

### 2. Cassandra Adapter
- [ ] `services/agent/adapter/src/index.ts` (HTTP server + Cassandra client)
- [ ] `services/agent/adapter/Dockerfile`
- [ ] `services/agent/adapter/package.json`

### 3. Docker Compose Unificado
- [ ] Actualizar `services/agent/pulse-ops-node/docker-compose.yml`
- [ ] Incluir: app + collector + adapter + Cassandra node
- [ ] Configurar networks y dependencias

### 4. Testing
- [ ] Probar flujo completo: app → collector → dual export
- [ ] Probar modo offline y recovery
- [ ] Verificar replicación Cassandra

**¿Quieres que implemente estos componentes ahora?** 🚀

Puedo crear:
- Collector config con retry queue + dual exporters
- Adapter HTTP → Cassandra (Node.js con cassandra-driver)
- Docker compose completo con todos los servicios
- Scripts de testing para verificar resiliencia

---

## 📊 Métricas Recolectadas

- `system.cpu.percent` - Porcentaje de uso de CPU (ObservableGauge con delta)
- `system.memory.percent` - Porcentaje de uso de RAM (ObservableGauge)

Las métricas se exportan cada **5 segundos** al Local Collector vía OTLP/gRPC.

**Labels automáticos**:
- `customer.id`: ID del cliente (multi-tenant)
- `service.name`: Nombre del servicio (`pulse-ops-node`)
- `host.name`: Hostname del agente
- `node.id`: ID único del nodo generado automáticamente

## 🐳 Docker Deployment (Producción)

La imagen usa **standalone output** con multi-stage builds:
- Tamaño final: **~110MB** (vs ~1GB sin standalone)
- Base: `node:20-alpine`
- User: non-root `nodejs` (seguridad)

Puerto expuesto: **3001**

La aplicación corre en <http://localhost:3001>.

