# 🚀 Despliegue del Agente PulseOps

## Orden de inicio correcto

### 1️⃣ Levantar Cluster Cassandra Central (si aplica)
```powershell
cd services/storage/cassandra
docker-compose up -d
# Esperar a que se inicialice: docker logs -f pulseops-db-init
```

### 2️⃣ Levantar Cassandra Agent (opcional - nodo local)
```powershell
cd services/agent/cassandra
docker-compose up -d
# Esperar a que se una al cluster: docker logs -f pulseops-agent-init
```

### 3️⃣ Levantar Collector + Adapter
```powershell
cd services/agent/collector
docker-compose up -d
```

### 4️⃣ Levantar App Next.js
```powershell
cd services/agent/pulse-ops-node
npm install
npm run dev
```

## 📊 Verificar que todo funciona

### Health checks
```powershell
# Collector
curl http://localhost:13133/health

# Adapter
curl http://localhost:8080/health
```

### Ver logs
```powershell
# Collector
docker logs -f pulseops-collector-agent

# Adapter
docker logs -f pulseops-cassandra-adapter
```

### Verificar métricas en Cassandra
```powershell
# Conectarse a Cassandra
docker exec -it pulseops-agent-cassandra cqlsh

# O si solo tienes el cluster central
docker exec -it pulseops-db-1 cqlsh
```

```sql
-- Ver métricas recientes
SELECT * FROM pulseops.metrics 
WHERE node_id = 'tu-hostname' 
  AND metric_name = 'system.cpu.percent' 
  AND time_bucket = '2025-11-04' 
LIMIT 10;
```

## 🔧 Configuración

### Archivo `.env` en `services/agent/collector/`
```env
# Host de Cassandra
CASSANDRA_HOST=host.docker.internal  # Para conectarse al cassandra-agent local (puerto 9043)
# CASSANDRA_HOST=cassandra-1         # Para conectarse directo al cluster central

CASSANDRA_PORT=9043  # Puerto del agent local
# CASSANDRA_PORT=9042  # Puerto del cluster central (si te conectas directo)

CASSANDRA_DC=dc1
```

## 🐛 Troubleshooting

### Adapter no conecta a Cassandra
```powershell
# Verificar que Cassandra está corriendo
docker ps | grep cassandra

# Verificar que el puerto 9043 está expuesto
docker port pulseops-agent-cassandra

# Test de conectividad
docker exec pulseops-cassandra-adapter ping host.docker.internal
```

### Collector no envía al adapter
```powershell
# Ver logs del collector
docker logs pulseops-collector-agent | grep -i error

# Verificar que el adapter está healthy
docker inspect pulseops-cassandra-adapter | grep -i health
```

### Métricas no llegan a Cassandra
```powershell
# Verificar que la app envía métricas
# En la consola de Next.js deberías ver:
# [12:00:00] 📊 system.cpu.percent: 45.20%
# [12:00:00] 📊 system.memory.percent: 68.50%

# Verificar que el collector las recibe
docker logs pulseops-collector-agent | grep -i metric

# Verificar que el adapter las escribe
docker logs pulseops-cassandra-adapter | grep -i inserted
```
