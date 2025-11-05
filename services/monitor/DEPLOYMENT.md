# 🚀 Despliegue de Grafana con Cassandra API Gateway

## ⚠️ Puerto Actualizado
El API Gateway ahora usa el puerto **3002** (el 3001 estaba ocupado por pulse-ops-node).

## 📋 Pasos para Desplegar

### 1. Ejecutar el script de despliegue
```powershell
cd C:\Users\rhuaj\Desktop\Repositorios\tp-ing-soft-III\services\monitor
.\restart.ps1
```

### 2. O manualmente
```powershell
cd C:\Users\rhuaj\Desktop\Repositorios\tp-ing-soft-III\services\monitor

# Detener contenedores actuales
docker compose down

# Construir y levantar
docker compose up -d --build
```

## 🔍 Verificación

### Verificar que los contenedores están corriendo
```powershell
docker ps --filter "name=monitor"
```

Deberías ver:
- `monitor-cassandra-api` (puerto 3002)
- `monitor-grafana` (puerto 3000)

### Verificar logs del API Gateway
```powershell
docker logs monitor-cassandra-api -f
```

Deberías ver:
```
✅ Connected to Cassandra cluster
🚀 Cassandra API Gateway started { port: 3002 }
```

### Verificar logs de Grafana
```powershell
docker logs monitor-grafana -f
```

Busca:
```
Installed yesoreyeram-infinity-datasource successfully
```

### Probar el API Gateway
```powershell
# Health check
curl http://localhost:3002/health

# Listar nodos
curl http://localhost:3002/api/nodes

# Estadísticas
curl http://localhost:3002/api/stats/total
curl http://localhost:3002/api/stats/nodes
```

## 🎨 Acceder a Grafana

1. Abrir navegador: http://localhost:3000
2. Login:
   - Usuario: `admin`
   - Password: `admin`
3. Ir a **Dashboards** → "System Metrics - Cassandra API"

## 🐛 Troubleshooting

### Error: "Port 3002 already allocated"
```powershell
# Ver qué usa el puerto
netstat -ano | Select-String ":3002"

# Cambiar el puerto en docker-compose.yml y datasources.yml
```

### Error: "Cannot connect to Cassandra"
```powershell
# Verificar que Cassandra está corriendo
docker ps --filter "name=cassandra"

# Verificar red
docker network inspect cassandra_cassandra-net
```

### Error: "Datasource not found"
```powershell
# Esperar a que Grafana instale el plugin
docker logs monitor-grafana -f

# Verificar que el plugin se instaló
docker exec monitor-grafana grafana-cli plugins ls
# Debe mostrar: yesoreyeram-infinity-datasource
```

### Dashboard no muestra datos
1. Verificar que hay métricas en Cassandra:
```powershell
docker exec pulseops-db-1 cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics LIMIT 10000;"
```

2. Verificar que el API Gateway puede consultar Cassandra:
```powershell
curl "http://localhost:3002/api/metrics?node_id=5c48bfd130c0&metric_name=system.cpu.percent&from=1730754000000&to=1730757600000"
```

3. Ajustar el time range en Grafana a "Last 15 minutes"

## 🔗 URLs Útiles

- **Grafana UI**: http://localhost:3000
- **API Gateway Health**: http://localhost:3002/health
- **API Nodes**: http://localhost:3002/api/nodes
- **API Stats**: http://localhost:3002/api/stats/total

## 📊 Arquitectura Completa

```
pulse-ops-node (Next.js) :3001
    ↓ OTLP gRPC
collector-agent :4317
    ↓ OTLP HTTP JSON
cassandra-adapter :8080
    ↓ CQL INSERT
Cassandra Cluster :9042
    ↑ CQL SELECT
Cassandra API Gateway :3002
    ↑ HTTP REST
Grafana :3000
```

## 🎯 Siguiente Paso

Una vez que los servicios estén corriendo:
1. Accede a Grafana (http://localhost:3000)
2. Ve a **Configuration** → **Data Sources**
3. Verifica que "Cassandra-API" aparece como datasource
4. Abre el dashboard "System Metrics - Cassandra API"
5. Deberías ver gráficos de CPU y Memoria en tiempo real
