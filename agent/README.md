# Agente PulseOps

Agente que se despliega en nodos de clientes para generar y enviar telemetría.

## Componentes

- **pulse-ops-node**: Aplicación Next.js que genera métricas del sistema
- **collector-agent**: OpenTelemetry Collector que recibe OTLP
- **cassandra-adapter**: Adaptador que convierte OTLP a CQL
- **cassandra-agent**: Nodo Cassandra edge (dc2)

## Despliegue

```bash
# 1. Levantar nodo Cassandra edge
cd cassandra
docker compose up -d

# 2. Levantar collector + adapter
cd collector
docker compose up -d

# 3. Levantar pulse-ops-node
cd ..
docker compose up -d
```

## Verificación

```bash
# Ver estado del agente
docker logs pulse-ops-node --tail 20

# Ver métricas enviadas
docker logs pulseops-cassandra-adapter --tail 10
```
