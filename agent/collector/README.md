# Collector - OpenTelemetry Collector + Cassandra Adapter

Recibe telemetría OTLP de agentes y escribe directamente en Cassandra.

## Componentes

- **OTel Collector**: Recibe métricas OTLP (puerto 4317/4318)
- **Cassandra Adapter**: Escribe métricas en Cassandra con tenant isolation

## Despliegue

```bash
cd agent/collector
docker compose up -d
```

## Verificación

```bash
# Ver logs del collector
docker logs pulseops-otel-collector --tail 20

# Ver logs del adapter
docker logs pulseops-cassandra-adapter --tail 20
# Debe mostrar: "Metrics written to Cassandra"

# Enviar métrica de prueba
curl -X POST http://localhost:4318/v1/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": {"stringValue": "test-service"}
        }]
      },
      "scopeMetrics": [{
        "metrics": [{
          "name": "test_metric",
          "gauge": {
            "dataPoints": [{
              "asDouble": 42.0,
              "timeUnixNano": "1699999999000000000"
            }]
          }
        }]
      }]
    }]
  }'
```

---

**Configuración**: 
- Datacenter: dc2 (edge)
- Consistency: LOCAL_ONE
- Tenant ID: Extraído de `service.name`
