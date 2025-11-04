# Cassandra Agent Node

Nodo Cassandra independiente que se une al cluster principal de PulseOps.

## 🎯 Propósito

Este nodo Cassandra:
- ✅ Se ejecuta en la máquina del agente (edge)
- ✅ Se une automáticamente al cluster principal
- ✅ Replica datos localmente para baja latencia
- ✅ Puede operar en modo offline (con eventual consistency)
- ✅ Usa menos recursos que los nodos principales

## 🚀 Despliegue

### Prerequisitos:
```bash
# 1. El cluster principal debe estar corriendo
cd ../../storage/cassandra
docker compose up -d

# 2. Verificar que cassandra-1 esté accesible desde host
docker exec -it pulseops-db-1 nodetool status
```

### Iniciar el nodo agente:
```bash
cd services/agent/cassandra

# Levantar nodo
docker compose up -d

# Ver logs
docker compose logs -f cassandra-agent

# Esperar a que se una al cluster (puede tardar 1-2 minutos)
```

### Verificar que se unió al cluster:
```bash
# Desde el nodo principal
docker exec -it pulseops-db-1 nodetool status

# Deberías ver 4 nodos ahora:
# UN  172.x.x.x  rack1        (cassandra-1)
# UN  172.x.x.x  rack2        (cassandra-2)
# UN  172.x.x.x  rack3        (cassandra-3)
# UN  172.x.x.x  rack-agent   (cassandra-agent) ← NUEVO
```

## 📊 Configuración

### Diferencias con nodos principales:

| Característica | Nodos Principales | Nodo Agente |
|---------------|------------------|-------------|
| **Memoria** | 3GB | 1.5GB |
| **Heap** | 256M-1G | 128M-512M |
| **Puerto** | 9042 | 9043 |
| **Rack** | rack1/2/3 | rack-agent |
| **Propósito** | Storage pesado | Edge computing |

### Variables de entorno clave:

```yaml
CASSANDRA_CLUSTER_NAME: PulseOpsCluster  # DEBE coincidir
CASSANDRA_DC: dc1                        # DEBE coincidir
CASSANDRA_RACK: rack-agent               # Único para este agente
CASSANDRA_SEEDS: host.docker.internal:9042  # IP del cluster principal
```

## 🔧 Uso desde la aplicación

### Conectarse al nodo local (baja latencia):

```typescript
import { Client } from 'cassandra-driver';

const client = new Client({
  contactPoints: ['localhost:9043'],  // Nodo local del agente
  localDataCenter: 'dc1',
  keyspace: 'pulseops',
});

await client.connect();

// Escribir métricas (se replican al cluster automáticamente)
await client.execute(
  `INSERT INTO metrics (node_id, metric_name, time_bucket, timestamp, value)
   VALUES (?, ?, ?, ?, ?)`,
  ['agent-001', 'system.cpu.percent', '2025-11-04', new Date(), 45.5],
  { prepare: true }
);
```

## 🌐 Arquitectura Distribuida

```
┌─────────────────────────────────────────────────────────┐
│ Datacenter: dc1                                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Storage (Cloud)          Edge (Agent Machine)          │
│  ┌──────────────┐        ┌──────────────┐             │
│  │ cassandra-1  │◄──────►│ cassandra-   │             │
│  │ rack1        │        │ agent        │             │
│  └──────────────┘        │ rack-agent   │             │
│                          └──────────────┘             │
│  ┌──────────────┐              ▲                        │
│  │ cassandra-2  │              │                        │
│  │ rack2        │──────────────┘                        │
│  └──────────────┘                                       │
│                                                          │
│  ┌──────────────┐                                       │
│  │ cassandra-3  │                                       │
│  │ rack3        │                                       │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘

Replication Factor: 3
Data flows: Bidirectional (eventual consistency)
```

## 🔍 Monitoreo

### Ver estado del nodo agente:
```bash
# Desde el nodo agente
docker exec -it pulseops-agent-cassandra nodetool status

# Ver info del cluster
docker exec -it pulseops-agent-cassandra nodetool describecluster

# Ver ring completo
docker exec -it pulseops-agent-cassandra nodetool ring
```

### Verificar replicación:
```bash
# Insertar dato desde el agente
docker exec -it pulseops-agent-cassandra cqlsh -e "
  INSERT INTO pulseops.metrics (node_id, metric_name, time_bucket, timestamp, value)
  VALUES ('test-agent', 'test.metric', '2025-11-04', toTimestamp(now()), 99.9);
"

# Verificar que llegó al nodo principal
docker exec -it pulseops-db-1 cqlsh -e "
  SELECT * FROM pulseops.metrics 
  WHERE node_id='test-agent' 
    AND metric_name='test.metric' 
    AND time_bucket='2025-11-04';
"
```

## 🛠️ Troubleshooting

### El nodo no se une al cluster

**Problema**: Nodo queda en estado "Joining" o "Down"

```bash
# 1. Verificar logs
docker compose logs cassandra-agent | grep -i error

# 2. Verificar conectividad con el cluster
docker exec -it pulseops-agent-cassandra ping host.docker.internal

# 3. Verificar que el puerto 9042 esté accesible
telnet localhost 9042
```

**Soluciones**:
- Asegúrate que el cluster principal esté corriendo
- Verifica firewall/puertos
- Confirma que CASSANDRA_CLUSTER_NAME coincida

### Diferente topología de red

Si el cluster principal está en otra red:

```yaml
environment:
  # Cambiar de host.docker.internal a IP real
  - CASSANDRA_SEEDS=192.168.1.100:9042,192.168.1.101:9042
```

### Remover el nodo del cluster

```bash
# 1. Detener el nodo agente
docker compose down

# 2. Desde un nodo principal, obtener el UUID
docker exec -it pulseops-db-1 nodetool status
# Copiar el UUID del nodo rack-agent

# 3. Remover del cluster
docker exec -it pulseops-db-1 nodetool removenode <UUID>

# 4. Limpiar datos (opcional)
docker volume rm cassandra_cassandra-agent-data
```

## 📈 Beneficios

### Ventajas de tener un nodo en el agente:

1. **Baja latencia**: Escrituras locales (< 5ms)
2. **Resiliencia**: Funciona offline, sincroniza después
3. **Distribución**: Cada agente mantiene sus datos localmente
4. **Escalabilidad**: Agrega nodos fácilmente
5. **Consistency**: Eventual consistency automática

### Casos de uso:

- ✅ Edge computing con IoT devices
- ✅ Agentes distribuidos geográficamente
- ✅ Escenarios con conectividad intermitente
- ✅ Multi-tenant con datos distribuidos

## ⚙️ Ajustes de rendimiento

### Para agentes con más recursos:
```yaml
environment:
  - HEAP_NEWSIZE=256M
  - MAX_HEAP_SIZE=1G
deploy:
  resources:
    limits:
      memory: 2g
```

### Para agentes IoT/edge ligeros:
```yaml
environment:
  - HEAP_NEWSIZE=64M
  - MAX_HEAP_SIZE=256M
deploy:
  resources:
    limits:
      memory: 768m
```

## 🔗 Integración con OpenTelemetry

El nodo agente puede recibir métricas directamente:

```typescript
// En el agente OpenTelemetry
import { CassandraExporter } from './cassandra-exporter';

const exporter = new CassandraExporter({
  contactPoints: ['localhost:9043'],  // Nodo local
  keyspace: 'pulseops',
});

// Las métricas se escriben localmente y se replican automáticamente
```
