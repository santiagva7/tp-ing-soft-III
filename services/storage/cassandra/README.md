# Cassandra Cluster - Storage Backend

Cluster de 3 nodos Cassandra 5.0 para almacenamiento de métricas históricas (cold storage).

**✨ Configuración completamente automatizada:**
- ✅ Todo en `docker-compose.yml` (sin archivos externos)
- ✅ Sin Python, sin scripts, sin Dockerfile custom
- ✅ Inicialización automática de keyspace y tablas
- ✅ 1 solo comando: `docker compose up -d`

## 🚀 Quick Start

```bash
# Iniciar cluster completo (automáticamente crea keyspace y tablas)
docker compose up -d

# Ver logs de inicialización
docker compose logs -f cassandra-init

# Verificar estado del cluster
docker exec -it pulseops-db-1 nodetool status

# Verificar que se creó el keyspace
docker exec -it pulseops-db-1 cqlsh -e "DESCRIBE KEYSPACE pulseops"

# Conectar con cqlsh
docker exec -it pulseops-db-1 cqlsh
```

## 📊 Arquitectura del Cluster

### Configuración actual:
- **Versión**: Cassandra 5.0 (imagen oficial)
- **Nodos**: 3 nodos (pulseops-db-1, pulseops-db-2, pulseops-db-3)
- **Datacenter**: `dc1` (datacenter único)
- **Racks**: rack1, rack2, rack3 (distribución de réplicas)
- **Replication Factor**: 3 (cada dato en los 3 nodos)
- **Cluster Name**: `PulseOpsCluster`
- **Snitch**: GossipingPropertyFileSnitch

### Recursos por nodo:
- **Memoria límite**: 3GB por contenedor
- **Heap Java**: NewSize 256M, MaxSize 1G
- **Puerto**: 9042 (solo expuesto en cassandra-1)
- **Red**: cassandra-net (bridge network)

## 🗄️ Schema

### Keyspace: `pulseops`
- Replication Factor: 3
- Strategy: NetworkTopologyStrategy

### Tabla: `metrics`
```cql
PRIMARY KEY ((node_id, metric_name, time_bucket), timestamp)
```

Particionamiento por:
- `node_id`: ID del agente/nodo
- `metric_name`: Nombre de la métrica (system.cpu.percent, etc.)
- `time_bucket`: Día ('2025-11-04')

Clustering por:
- `timestamp`: Orden descendente (más reciente primero)

### Optimizaciones

- **TimeWindowCompactionStrategy**: Ventana de 1 día
- **TTL**: 30 días por defecto
- **GC Grace**: 1 día
- **Índice secundario** en labels para filtrar por customer_id

## 🔧 Configuración

### Healthchecks
```yaml
interval: 30s
timeout: 10s
retries: 10
start_period: 60s  # Dar tiempo al cluster para iniciar
```

### Recursos
```yaml
memory: 3g per node
HEAP_NEWSIZE: 256M
MAX_HEAP_SIZE: 1G
```

## 📝 Queries Comunes

### Insertar una métrica
```cql
INSERT INTO pulseops.metrics (node_id, metric_name, time_bucket, timestamp, value)
VALUES ('agent-001', 'system.cpu.percent', '2025-11-04', toTimestamp(now()), 45.5);
```

### Consultar métricas de un nodo en un día
```cql
SELECT * FROM pulseops.metrics 
WHERE node_id = 'agent-001' 
  AND metric_name = 'system.cpu.percent'
  AND time_bucket = '2025-11-04'
LIMIT 100;
```

### Últimas 10 métricas (más recientes)
```cql
SELECT timestamp, value FROM pulseops.metrics 
WHERE node_id = 'agent-001' 
  AND metric_name = 'system.memory.percent'
  AND time_bucket = '2025-11-04'
LIMIT 10;
```

### Consultar rango de tiempo específico
```cql
SELECT * FROM pulseops.metrics 
WHERE node_id = 'agent-001'
  AND metric_name = 'system.cpu.percent'
  AND time_bucket = '2025-11-04'
  AND timestamp >= '2025-11-04 10:00:00'
  AND timestamp <= '2025-11-04 12:00:00';
```

## 🔍 Comandos de Monitoreo

### Estado del cluster
```bash
# Ver estado de todos los nodos
docker exec -it pulseops-db-1 nodetool status

# Resultado esperado:
# UN = Up + Normal (todos los nodos deben estar UN)
# 100.0% = Cada nodo tiene todos los datos (RF=3)
```

### Información del ring
```bash
# Ver distribución de tokens
docker exec -it pulseops-db-1 nodetool ring

# Ver información del cluster
docker exec -it pulseops-db-1 nodetool describecluster
```

### Schema y datos
```bash
# Ver todos los keyspaces
docker exec -it pulseops-db-1 cqlsh -e "DESCRIBE KEYSPACES"

# Ver schema completo de pulseops
docker exec -it pulseops-db-1 cqlsh -e "DESCRIBE KEYSPACE pulseops"

# Ver estadísticas de la tabla metrics
docker exec -it pulseops-db-1 nodetool tablestats pulseops.metrics

# Contar registros (cuidado en producción)
docker exec -it pulseops-db-1 cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics"
```

### Logs de contenedores
```bash
# Ver logs de un nodo específico
docker compose logs cassandra-1

# Ver logs de inicialización
docker compose logs cassandra-init

# Seguir logs en tiempo real
docker compose logs -f cassandra-1
```

## 🛠️ Troubleshooting

### Cluster no se forma
```bash
# Verificar logs de cada nodo
docker compose logs cassandra-1
docker compose logs cassandra-2
docker compose logs cassandra-3

# Verificar conectividad
docker exec -it pulseops-db-1 nodetool describecluster
```

### Reiniciar cluster limpio
```bash
docker compose down -v  # ⚠️ ESTO ELIMINA TODOS LOS DATOS
docker compose up -d
```

### Agregar más nodos
Simplemente duplica el servicio en docker-compose.yml:
```yaml
cassandra-4:
  image: cassandra:5.0
  environment:
    - CASSANDRA_SEEDS=cassandra-1,cassandra-2,cassandra-3,cassandra-4
    # ... resto de config
```

## 📈 Características de Rendimiento

### Capacidades del cluster actual:
- **Escrituras**: ~10,000-30,000 ops/sec (combinado en 3 nodos)
- **Lecturas**: Depende del partition key y consistency level
  - Con partition key completa: < 10ms
  - Sin partition key (full scan): muy lento, evitar
- **Compaction**: SizeTieredCompactionStrategy (automática)
- **TTL automático**: 30 días (2,592,000 segundos)
- **Consistency Level**: Default LOCAL_ONE para lecturas/escrituras

### Límites de diseño:
- **Max partition size**: ~100MB (evitar particiones grandes)
- **Time bucket**: Particionamiento por día (balancear carga)
- **Replication Factor**: 3 (todas las escrituras en 3 nodos)

### Best Practices:
1. **Siempre especificar partition key completa** en queries:
   ```cql
   WHERE node_id = ? AND metric_name = ? AND time_bucket = ?
   ```
2. **Usar LIMIT** en queries para evitar timeouts
3. **Evitar SELECT ***: Especificar columnas necesarias
4. **Monitoring**: Revisar `nodetool tablestats` regularmente

## 🔗 Integración con el Stack de Monitoreo

Este cluster Cassandra es el **cold storage** del sistema PulseOps:

```
OpenTelemetry Agent (port 3001)
    ↓ OTLP gRPC
OpenTelemetry Collector (port 4317)
    ↓
    ├─→ Prometheus (hot: 30 días)     port 9090
    └─→ Cassandra (cold: histórico)   port 9042
```

### Flujo de datos:
1. **Agent** (Next.js) envía métricas vía OTLP gRPC
2. **Collector** recibe y procesa métricas
3. **Prometheus** almacena últimos 30 días (queries rápidas)
4. **Cassandra** almacena histórico completo (queries analíticas)

### Próximos pasos:
- [ ] Crear adapter OTLP → Cassandra
- [ ] Configurar remote write desde Prometheus
- [ ] Implementar agregaciones pre-calculadas
- [ ] Dashboard Grafana con fuente Cassandra
