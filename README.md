# Sistema de Monitoreo Multi-tenant con OpenTelemetry

Sistema de observabilidad SaaS para monitoreo de infraestructura de clientes mediante OpenTelemetry, con almacenamiento en Cassandra multi-datacenter y visualización en Grafana.

## Estructura del Proyecto

```
tp-ing-soft-III/
│
├── storage/
│   └── cassandra/         # Cluster Cassandra (3 nodos dc1)
├── agent/
│   ├── cassandra/         # Nodo edge Cassandra (dc2)
│   ├── collector/         # Collector OTLP + Adapter
│   └── pulse-ops-node/    # Agente generador de métricas
├── monitor/               # Grafana + API REST
└── README.md
```

---

## Inicio de Servicios (Orden Recomendado)

### 1. Cluster Cassandra Central (dc1)

```bash
cd storage/cassandra
docker compose up -d
```

Esperar ~3 minutos hasta que los 3 nodos estén UP:

```bash
docker exec -it pulseops-db-1 nodetool status
# Debe mostrar 3 nodos UN (Up/Normal) en dc1
```

### 2. Collector OTLP + Adapter (solo para crear red)

```bash
cd agent/collector
docker compose up -d
```

**Nota**: El adapter fallará en healthcheck porque Cassandra dc2 aún no existe. Esto es esperado - solo necesitamos crear la red `collector_default`.

### 3. Nodo Edge Cassandra (dc2)

```bash
cd agent/cassandra
docker compose up -d
```

Esperar ~30 segundos y verificar cluster multi-DC:

```bash
docker exec -it pulseops-agent-cassandra nodetool status
# Debe mostrar:
# Datacenter: dc1 (3 nodos)
# Datacenter: dc2 (1 nodo)
```

### 4. Reiniciar Collector (ahora conectará correctamente)

```bash
cd agent/collector
docker compose restart
```

Verificar conexión del adapter:

```bash
docker logs pulseops-cassandra-adapter --tail 20
# Debe mostrar: "Connected to Cassandra cluster"
```

### 5. Agente Pulse-Ops (Generador de Métricas)

```bash
cd agent/pulse-ops-node
docker compose up -d
```

Verificar que está escribiendo:

```bash
docker logs pulseops-cassandra-adapter --tail 10
# Debe mostrar: "Metrics written to Cassandra"
```

### 6. Monitoreo (Grafana + API)

```bash
cd monitor
docker compose up -d
```

Acceder a Grafana: <http://localhost:3000> (admin/admin)

---

## Prueba de Desconexión/Reconexión

### Objetivo

Validar que el nodo edge (dc2) puede escribir datos durante aislamiento de red y sincronizarse automáticamente al reconectar.

### Pasos

#### 1. Contar datos iniciales

```bash
# En el nodo edge (dc2)
docker exec -it pulseops-agent-cassandra cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics;"
# Anotar: COUNT_DC2_BEFORE

# En el cluster central (dc1)
docker exec -it pulseops-db-1 cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics;"
# Anotar: COUNT_DC1_BEFORE
```

#### 2. Desconectar el nodo edge

```bash
docker network disconnect cassandra_cassandra-net pulseops-agent-cassandra
```

#### 3. Esperar y verificar escrituras durante aislamiento

```bash
Start-Sleep -Seconds 30  # PowerShell (Windows)
# sleep 30               # Bash (Linux/Mac)

# Verificar que el adapter sigue escribiendo
docker logs pulseops-cassandra-adapter --tail 10
# Debe mostrar: "Metrics written to Cassandra"

# Contar datos en el nodo edge
docker exec -it pulseops-agent-cassandra cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics;"
# Anotar: COUNT_DC2_AFTER (debe ser > COUNT_DC2_BEFORE)

# Verificar que dc1 NO recibió datos nuevos
docker exec -it pulseops-db-1 cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics;"
# Debe ser igual a COUNT_DC1_BEFORE (aislado)
```

#### 4. Reconectar el nodo edge

```bash
docker network connect cassandra_cassandra-net pulseops-agent-cassandra
```

#### 5. Validar replicación automática

```bash
# Esperar 15 segundos para que se sincronice
Start-Sleep -Seconds 15  # PowerShell
# sleep 15               # Bash

# Verificar que dc1 recibió los datos
docker exec -it pulseops-db-1 cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics;"
# Debe ser igual a COUNT_DC2_AFTER (replicación exitosa)
```

### Resultados Esperados

- Durante aislamiento: edge escribe localmente con CL=LOCAL_ONE
- dc1 no recibe datos mientras está aislado
- Tras reconexión: datos se replican automáticamente
- 0 pérdida de datos

---

## Documentación Detallada

- [Agent](agent/README.md)
- [Collector](agent/collector/README.md)
- [Storage](storage/README.md)

---

**Última actualización**: Noviembre 5, 2025  
**Versión**: 1.1.0-MVP-MultiDC
