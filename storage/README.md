# Storage - Cluster Cassandra Multi-Datacenter

Cluster Cassandra distribuido en 2 datacenters:
- **dc1**: 3 nodos (cassandra-1, cassandra-2, cassandra-3) - Cluster central
- **dc2**: 1 nodo edge (cassandra-agent) - Nodo en borde

## Componentes

- **Cassandra Cluster (dc1)**: 3 nodos con NetworkTopologyStrategy (RF=3)
- **Keyspace**: `pulseops` con replicación dc1=3, dc2=1
- **Consistencia**: LOCAL_ONE para operaciones locales

## Despliegue

```bash
cd services/storage/cassandra
docker compose up -d
```

**Esperar ~3 minutos** hasta que los nodos estén UP.

## Verificación

```bash
# Ver estado del cluster
docker exec -it pulseops-db-1 nodetool status

# Debe mostrar:
# Datacenter: dc1
# Status=Up/Down
# |/ State=Normal/Leaving/Joining/Moving
# --  Address     Load       Tokens  Owns    Host ID     Rack
# UN  172.20.0.2  ?          16      ?       ...         rack1
# UN  172.20.0.3  ?          16      ?       ...         rack2
# UN  172.20.0.4  ?          16      ?       ...         rack3

# Ver keyspace
docker exec -it pulseops-db-1 cqlsh -e "DESCRIBE KEYSPACE pulseops;"
```

## Consultas Útiles

```bash
# Contar métricas almacenadas
docker exec -it pulseops-db-1 cqlsh -e "SELECT COUNT(*) FROM pulseops.metrics;"

# Ver últimas métricas
docker exec -it pulseops-db-1 cqlsh -e "SELECT * FROM pulseops.metrics LIMIT 10;"

# Ver info del cluster
docker exec -it pulseops-db-1 nodetool info
```

---

**Nota**: El nodo edge (dc2) se encuentra en `services/agent/cassandra/`
