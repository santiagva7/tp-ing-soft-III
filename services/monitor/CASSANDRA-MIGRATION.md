# Migración de Grafana a Cassandra

## 🎯 Cambios Realizados

### 1. Docker Compose
- ✅ Agregado plugin `hadesarchitect-cassandra-datasource`
- ✅ Conectado a la red `cassandra_cassandra-net`
- ✅ Agregado volumen persistente para Grafana

### 2. Datasources
- ✅ Cassandra configurado como datasource principal
- ✅ Prometheus mantenido como datasource secundario (legacy)
- ✅ Configuración:
  - Host: `pulseops-db-1:9042`
  - Keyspace: `pulseops`
  - Consistency: `ONE`
  - Local DC: `dc1`

### 3. Nuevo Dashboard
- ✅ `Cassandra-Metrics.json` creado
- ✅ Visualizaciones:
  - System CPU Usage (%)
  - System Memory Usage (%)
  - Total Metrics Stored
  - Active Nodes
- ✅ Variables de dashboard para seleccionar nodo
- ✅ Auto-refresh cada 5 segundos

## 🚀 Despliegue

### Paso 1: Levantar Grafana
```powershell
cd C:\Users\rhuaj\Desktop\Repositorios\tp-ing-soft-III\services\monitor
docker compose up -d
```

### Paso 2: Esperar que el plugin se instale
```powershell
# Ver logs de instalación del plugin
docker logs monitor-grafana -f
```

Deberías ver algo como:
```
Installing plugin hadesarchitect-cassandra-datasource...
✓ Installed hadesarchitect-cassandra-datasource successfully
```

### Paso 3: Acceder a Grafana
- URL: http://localhost:3000
- Usuario: `admin`
- Password: `admin`

### Paso 4: Verificar Datasource
1. Ir a **Configuration** → **Data Sources**
2. Verificar que "Cassandra" aparezca en la lista
3. Click en "Cassandra" → **Save & Test**
4. Deberías ver "Data source is working"

### Paso 5: Abrir el Dashboard
1. Ir a **Dashboards**
2. Buscar "System Metrics - Cassandra"
3. Deberías ver las métricas en tiempo real

## 🔧 Troubleshooting

### El datasource de Cassandra no aparece
```powershell
# Verificar que el plugin se instaló
docker exec monitor-grafana grafana-cli plugins ls

# Debería mostrar:
# hadesarchitect-cassandra-datasource @ x.x.x
```

### Error "Cannot connect to Cassandra"
```powershell
# Verificar que Grafana está en la red correcta
docker inspect monitor-grafana | Select-String "Networks"

# Debería mostrar: cassandra_cassandra-net

# Verificar conectividad
docker exec monitor-grafana ping pulseops-db-1 -c 3
```

### El dashboard no muestra datos
1. Verificar que hay métricas en Cassandra:
```powershell
docker exec pulseops-db-1 cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics;"
```

2. Verificar que el adapter está escribiendo:
```powershell
docker logs pulseops-cassandra-adapter --tail 20
# Deberías ver: "✅ Metrics written to Cassandra"
```

3. Ajustar el time range en Grafana (top-right) a "Last 15 minutes"

### Queries de ejemplo para probar manualmente

En Grafana, ir al datasource de Cassandra y probar:

```cql
-- Ver nodos únicos
SELECT DISTINCT node_id FROM pulseops.metrics ALLOW FILTERING;

-- Ver métricas de CPU del último día
SELECT timestamp, value 
FROM pulseops.metrics 
WHERE metric_name = 'system.cpu.percent' 
  AND time_bucket = '2025-11-04'
ALLOW FILTERING;

-- Contar total de métricas
SELECT COUNT(*) FROM pulseops.metrics;
```

## 📊 Estructura de Datos en Cassandra

```
pulseops.metrics
├─ node_id (partition key)
├─ metric_name (partition key)
├─ time_bucket (partition key) → 'YYYY-MM-DD'
├─ timestamp (clustering key) → DESC
└─ value (double)
```

## 🎨 Personalización del Dashboard

Para editar el dashboard:
1. Abrir el dashboard en Grafana
2. Click en **Dashboard settings** (⚙️)
3. Editar los paneles según necesites
4. **Importante**: Exportar el JSON y guardarlo en `grafana/dashboards/Cassandra-Metrics.json`

### Query Template para agregar más métricas:

```cql
SELECT timestamp, value 
FROM pulseops.metrics 
WHERE node_id = '$node_id' 
  AND metric_name = 'NOMBRE_METRICA' 
  AND time_bucket = '$__timeFilter' 
ALLOW FILTERING
```

Reemplaza `NOMBRE_METRICA` con:
- `system.cpu.percent`
- `system.memory.percent`
- `v8js.memory.heap.used`
- `v8js.memory.heap.limit`
- etc.

## ✅ Checklist de Verificación

- [ ] Cassandra cluster corriendo (3 nodos)
- [ ] Adapter escribiendo métricas
- [ ] Grafana levantado con plugin Cassandra
- [ ] Datasource "Cassandra" configurado y funcionando
- [ ] Dashboard "System Metrics - Cassandra" visible
- [ ] Gráficos mostrando datos en tiempo real
- [ ] Selector de nodos funcional
- [ ] Auto-refresh activado (5s)

## 🔄 Rollback a Prometheus

Si necesitas volver a Prometheus:
1. En Grafana, ir a **Data Sources**
2. Click en "Prometheus-Hot" → **Set as default**
3. Abrir el dashboard "Metrics-Charts" (el viejo de Prometheus)
