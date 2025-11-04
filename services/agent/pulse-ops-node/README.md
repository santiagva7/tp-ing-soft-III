# Pulse Ops Node - Next.js Agent

Agente de monitoreo construido con Next.js 16 y OpenTelemetry para recolectar métricas de sistema (CPU, RAM).

**Arquitectura resiliente con persistencia local**: El agente envía métricas a un **OpenTelemetry Collector local** que:
- Exporta a **Collector Central** (cuando está disponible)
- Persiste localmente en **Cassandra Agent Node** (para resiliencia offline)
- Garantiza **no pérdida de datos** mediante replicación automática

## 🏗️ Arquitectura del Agente

### Flujo de datos completo (con resiliencia)

```
┌─────────────────────────────────────────────────────────────────────┐
│ AGENT MACHINE                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    OTLP/gRPC (4317)   ┌──────────────────┐  │
│  │  Next.js App     │───────────────────────>│ Local Collector  │  │
│  │  (pulse-ops-node)│    localhost:4317      │  (OTel Collector)│  │
│  └──────────────────┘                        └────────┬─────────┘  │
│   • CPU metrics                                       │             │
│   • RAM metrics                              ┌────────┴────────┐   │
│   • Customer labels                          │  Dual Exporters │   │
│                                              └────┬──────────┬─┘   │
│                                                   │          │      │
│                                                   │          │      │
│                                      OTLP/gRPC   │          │ HTTP │
│                                      (retry +    │          │ POST │
│                                       queue)     │          │      │
│                                                   │          ▼      │
│                                                   │    ┌──────────┐ │
│                                                   │    │ Cassandra│ │
│                                                   │    │  Adapter │ │
│                                                   │    └─────┬────┘ │
│                                                   │          │      │
│                                                   │          ▼      │
│                                                   │    ┌──────────┐ │
│                                                   │    │ Cassandra│ │
│                                                   │    │  Node    │ │
│                                                   │    │ (Agent)  │ │
│                                                   │    └──────────┘ │
└───────────────────────────────────────────────────┼─────────────────┘
                                                    │
                                                    │ Internet/Network
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
                              │  ┌──────────────────┐              │
                              │  │   Prometheus     │              │
                              │  │   (hot storage)  │              │
                              │  └──────────────────┘              │
                              │                                     │
                              │  ┌──────────────────┐              │
                              │  │ Cassandra Cluster│              │
                              │  │ (3 nodes: cold)  │◄────────┐    │
                              │  └──────────────────┘         │    │
                              │                                │    │
                              └────────────────────────────────┼────┘
                                                               │
                                        Cassandra Gossip Protocol
                                        (auto-replication)
                                                               │
                              ┌────────────────────────────────┘
                              │
                              └──► Agent Cassandra Node (replicates data)
```

### Comportamiento en diferentes escenarios

#### ✅ Escenario 1: Todo conectado (normal)
1. **App Next.js** → métricas → **Collector Local** (localhost:4317)
2. **Collector Local** procesa y exporta:
   - → **Collector Central** (vía OTLP/gRPC con retry queue)
   - → **Cassandra Adapter** → **Cassandra Agent Node** (local)
3. **Cassandra Agent Node** replica datos al **Cassandra Cluster** (automático)
4. **Collector Central** → Prometheus (hot) + Cassandra Cluster (cold)
5. Resultado: Datos en **Prometheus + Cassandra Cluster + Cassandra Agent**

#### 🔌 Escenario 2: Central offline (sin conexión a internet/central)
1. **App Next.js** → métricas → **Collector Local** ✅
2. **Collector Local** intenta exportar a **Collector Central** ❌ (falla)
3. **Collector Local** guarda en **persistent queue** (disco) para retry
4. **Collector Local** → **Cassandra Adapter** → **Cassandra Agent Node** ✅ (local)
5. Resultado: Datos **solo en Cassandra Agent** (persistidos localmente)
6. Cuando central vuelve: **queue retry** envía datos acumulados al central

#### 💾 Escenario 3: Cassandra Agent offline (falla nodo local)
1. **App Next.js** → métricas → **Collector Local** ✅
2. **Collector Local** exporta a **Collector Central** ✅
3. **Collector Local** intenta → **Cassandra Adapter** ❌ (falla)
4. Resultado: Datos en **Collector Central** → Prometheus + Cassandra Cluster
5. Pérdida: Solo la copia local del agente (pero datos siguen en cluster central)

### Ventajas de esta arquitectura

| Ventaja | Descripción |
|---------|-------------|
| **🛡️ Resiliencia** | Datos no se pierden si central cae (persistent queue + Cassandra local) |
| **⚡ Baja latencia** | Escritura local en Cassandra Agent (< 5ms), no espera a central |
| **🔄 Auto-replicación** | Cassandra se encarga de sincronizar agente ↔ cluster automáticamente |
| **📊 Formato consistente** | Mismo pipeline de procesamiento (local collector = central config) |
| **🎯 Edge computing** | Cada agente puede operar independientemente |
| **📈 Escalable** | Agregar agentes = agregar nodos Cassandra al cluster |

### Componentes del agente

1. **Next.js App** (`pulse-ops-node`):
   - Genera métricas de sistema (CPU, RAM)
   - Envía vía OpenTelemetry SDK a `localhost:4317`
   
2. **Local Collector** (`otel-collector`):
   - Recibe OTLP/gRPC en puerto 4317
   - Aplica procesamiento (batch, attributes, filters)
   - Exporta dual: central (retry queue) + local (Cassandra)

3. **Cassandra Adapter**:
   - Recibe métricas del collector vía HTTP POST
   - Transforma a schema Cassandra (`pulseops.metrics`)
   - Inserta en Cassandra Agent Node

4. **Cassandra Agent Node**:
   - Nodo Cassandra que se une al cluster principal
   - Almacena datos localmente (bajo volumen)
   - Replica automáticamente al cluster central

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

El collector local (`otel-collector-config.yaml`) debe tener:

**Receivers**:
- `otlp`: gRPC en puerto 4317 (recibe de la app)

**Processors** (mismo que central):
- `batch`: Agrupa métricas (5000 metrics, 10s timeout)
- `attributes`: Agrega labels (customer_id, node_id)
- `resource`: Detecta hostname, OS, etc.

**Exporters**:
- `otlp/central`: Envía al collector central
  - `endpoint`: `http://host.docker.internal:4317` (o IP real)
  - `retry_on_failure`: enabled
  - `sending_queue`: persistent (disk-based)
  - `queue_size`: 5000
- `otlphttp/cassandra-adapter`: Envía al adapter local
  - `endpoint`: `http://cassandra-adapter:8080/metrics`
  - `timeout`: 5s

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

