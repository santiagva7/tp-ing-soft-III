# Cassandra Adapter - OTLP to Cassandra Bridge

Servicio Node.js ligero que convierte métricas OpenTelemetry (OTLP) a inserciones CQL en Cassandra.

## 🎯 Propósito

Actúa como un **bridge** entre el OpenTelemetry Collector y Cassandra, permitiendo persistir métricas sin que el collector necesite conocer el schema específico de Cassandra.

## 📊 Funcionalidad

### Input: OTLP HTTP
- **Endpoint**: `POST /v1/metrics`
- **Formato**: OTLP JSON (OpenTelemetry Protocol)
- **Puerto**: 8080

### Output: Cassandra CQL
- **Protocolo**: Cassandra native protocol
- **Puerto**: 9042
- **Keyspace**: `pulseops`
- **Table**: `metrics`

## 🏗️ Arquitectura

```
┌──────────────────────┐
│  OpenTelemetry       │
│  Collector           │
│                      │
│  OTLP HTTP Exporter  │
└──────────┬───────────┘
           │
           │ POST /v1/metrics
           │ Content-Type: application/json
           │
           ▼
┌──────────────────────┐
│  Cassandra Adapter   │
│  (Express HTTP)      │
│                      │
│  1. Parse OTLP       │
│  2. Extract metrics  │
│  3. Transform data   │
│  4. Batch INSERT     │
└──────────┬───────────┘
           │
           │ CQL Protocol
           │ INSERT INTO metrics
           │
           ▼
┌──────────────────────┐
│  Cassandra Agent     │
│  (cluster member)    │
│                      │
│  Keyspace: pulseops  │
│  Table: metrics      │
└──────────────────────┘
```

## 📝 Transformación de Datos

### OTLP Input Example
```json
{
  "resourceMetrics": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "pulse-ops-node" } },
          { "key": "node.id", "value": { "stringValue": "DESKTOP-ABC" } },
          { "key": "customer.id", "value": { "stringValue": "customer-123" } }
        ]
      },
      "scopeMetrics": [
        {
          "metrics": [
            {
              "name": "system.cpu.percent",
              "gauge": {
                "dataPoints": [
                  {
                    "timeUnixNano": "1699104000000000000",
                    "asDouble": 45.2
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### Cassandra Output
```sql
INSERT INTO pulseops.metrics 
  (node_id, metric_name, time_bucket, timestamp, value, customer_id)
VALUES 
  ('DESKTOP-ABC', 'system.cpu.percent', '2025-11-04', '2025-11-04 12:00:00', 45.2, 'customer-123');
```

## 🚀 Deployment

### Con Docker Compose (incluido en collector/docker-compose.yaml)

El adapter ya está configurado en el docker-compose del collector:

```yaml
cassandra-adapter:
  build:
    context: ../cassandra-adapter
  container_name: pulseops-cassandra-adapter
  environment:
    - CASSANDRA_HOST=cassandra-agent
    - CASSANDRA_PORT=9042
    - CASSANDRA_DC=dc1
    - PORT=8080
  ports:
    - "8080:8080"
  networks:
    - cassandra-net
```

### Levantar el servicio

```powershell
cd services/agent/collector
docker-compose up -d cassandra-adapter
```

### Verificar health

```powershell
curl http://localhost:8080/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "service": "cassandra-adapter"
}
```

## 📊 API Endpoints

### POST /v1/metrics
Recibe métricas OTLP y las escribe a Cassandra.

**Request:**
```bash
curl -X POST http://localhost:8080/v1/metrics \
  -H "Content-Type: application/json" \
  -d @metrics.json
```

**Response (Success):**
```json
{
  "status": "success",
  "inserted": 15
}
```

**Response (Error):**
```json
{
  "error": "Internal server error",
  "message": "Failed to insert into Cassandra"
}
```

### GET /health
Health check endpoint.

**Request:**
```bash
curl http://localhost:8080/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "cassandra-adapter"
}
```

## 🔧 Configuración

### Variables de Entorno

| Variable | Descripción | Default | Ejemplo |
|----------|-------------|---------|---------|
| `CASSANDRA_HOST` | Hostname de Cassandra | `cassandra-agent` | `localhost` |
| `CASSANDRA_PORT` | Puerto de Cassandra | `9042` | `9042` |
| `CASSANDRA_DC` | Datacenter | `dc1` | `dc1` |
| `PORT` | Puerto HTTP del adapter | `8080` | `8080` |

### Cassandra Client Config

El adapter usa las siguientes configuraciones del cliente:

```javascript
{
  contactPoints: ['cassandra-agent'],
  localDataCenter: 'dc1',
  keyspace: 'pulseops',
  pooling: {
    coreConnectionsPerHost: {
      local: 2,
      remote: 1
    }
  },
  queryOptions: {
    consistency: cassandra.types.consistencies.localQuorum,
    prepare: true
  }
}
```

## 📈 Performance

### Batch Inserts
El adapter procesa **todas las métricas en un solo batch** para máxima eficiencia:

```javascript
// Procesa N métricas en un solo batch
await Promise.all(insertPromises);
```

### Prepared Statements
Usa **prepared statements** para mejor performance:

```javascript
client.execute(query, params, { prepare: true })
```

### Memory Footprint
- **Imagen base**: `node:20-alpine` (~150MB)
- **Dependencias**: Express + cassandra-driver (~50MB)
- **Runtime**: ~30-50MB RAM en uso normal

## 🔍 Logs

El adapter usa `pino` con pretty-print para logs estructurados:

```
[2025-11-04 12:00:00] INFO: ✅ Connected to Cassandra cluster
[2025-11-04 12:00:15] INFO: Received OTLP metrics {"count":1}
[2025-11-04 12:00:15] INFO: ✅ Metrics written to Cassandra {"inserted":2}
```

### Ver logs en tiempo real

```powershell
docker logs -f pulseops-cassandra-adapter
```

## 🐛 Troubleshooting

### Problema: No conecta a Cassandra

**Síntoma:**
```
❌ Failed to connect to Cassandra
Error: All host(s) tried for query failed
```

**Solución:**
1. Verificar que `cassandra-agent` esté levantado:
   ```powershell
   docker ps | grep cassandra-agent
   ```

2. Verificar network:
   ```powershell
   docker network inspect cassandra_cassandra-net
   ```

3. Test conectividad:
   ```powershell
   docker exec pulseops-cassandra-adapter ping cassandra-agent
   ```

### Problema: Keyspace no existe

**Síntoma:**
```
❌ Keyspace "pulseops" does not exist
```

**Solución:**
El keyspace debe ser creado por el init script del cluster central:
```powershell
cd services/storage/cassandra
docker-compose up cassandra-init
```

### Problema: Alto error rate

**Síntoma:**
```
❌ Failed to write metrics to Cassandra
Error: WriteTimeout
```

**Solución:**
1. Verificar que el cluster esté healthy:
   ```powershell
   docker exec pulseops-agent-cassandra nodetool status
   ```

2. Reducir batch size en el collector (otel-collector-config.yaml):
   ```yaml
   processors:
     batch:
       send_batch_size: 512  # Reducir de 1024
   ```

## 🧪 Testing

### Test manual con curl

```powershell
# 1. Crear un payload OTLP
@"
{
  "resourceMetrics": [{
    "resource": {
      "attributes": [
        {"key": "node.id", "value": {"stringValue": "test-node"}},
        {"key": "customer.id", "value": {"stringValue": "test-customer"}}
      ]
    },
    "scopeMetrics": [{
      "metrics": [{
        "name": "test.metric",
        "gauge": {
          "dataPoints": [{
            "timeUnixNano": "$(([DateTimeOffset]::Now).ToUnixTimeMilliseconds() * 1000000)",
            "asDouble": 42.0
          }]
        }
      }]
    }]
  }]
}
"@ | Out-File -Encoding utf8 test-metrics.json

# 2. Enviar al adapter
curl -X POST http://localhost:8080/v1/metrics `
  -H "Content-Type: application/json" `
  -d @test-metrics.json

# 3. Verificar en Cassandra
docker exec -it pulseops-agent-cassandra cqlsh -e "
SELECT * FROM pulseops.metrics 
WHERE node_id = 'test-node' 
AND metric_name = 'test.metric' 
LIMIT 1;"
```

### Load testing con autocannon

```powershell
npm install -g autocannon

autocannon -c 10 -d 60 \
  -m POST \
  -H "Content-Type: application/json" \
  -i test-metrics.json \
  http://localhost:8080/v1/metrics
```

## 📦 Build

### Build Docker image

```powershell
cd services/agent/cassandra-adapter
docker build -t pulseops-cassandra-adapter:latest .
```

### Run standalone

```powershell
docker run -d \
  --name cassandra-adapter \
  --network cassandra_cassandra-net \
  -e CASSANDRA_HOST=cassandra-agent \
  -e CASSANDRA_PORT=9042 \
  -e PORT=8080 \
  -p 8080:8080 \
  pulseops-cassandra-adapter:latest
```

## 🔐 Security

### Consideraciones

- ⚠️ **Sin autenticación**: El adapter NO tiene auth (confía en network isolation)
- ⚠️ **Sin TLS**: Conexión HTTP plain (usar TLS en producción)
- ✅ **Prepared statements**: Previene SQL injection en CQL
- ✅ **Input validation**: Valida estructura OTLP antes de insertar

### Recomendaciones para producción

1. Agregar autenticación:
   ```javascript
   app.use('/v1/metrics', authenticateToken);
   ```

2. Habilitar TLS:
   ```javascript
   const https = require('https');
   https.createServer(options, app).listen(8443);
   ```

3. Rate limiting:
   ```javascript
   const rateLimit = require('express-rate-limit');
   app.use(rateLimit({ windowMs: 60000, max: 1000 }));
   ```

## 📚 Referencias

- [OpenTelemetry Protocol (OTLP) Specification](https://opentelemetry.io/docs/specs/otlp/)
- [Cassandra Node.js Driver](https://docs.datastax.com/en/developer/nodejs-driver/4.7/)
- [Express.js Documentation](https://expressjs.com/)
- [Pino Logger](https://github.com/pinojs/pino)

---

**Versión**: 1.0.0  
**Autor**: PulseOps Team  
**Licencia**: MIT
