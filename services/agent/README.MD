# OpenTelemetry Agent (Aplicación Instrumentada en Go)

## 1. Funcionamiento del Agente

El agente es una **aplicación escrita en Go que implementa el SDK de OpenTelemetry**. Su función principal es **generar y exportar telemetría (trazas, métricas y logs) en tiempo real** directamente al Collector.

### Arquitectura: Enfoque de OpenTelemetry

OpenTelemetry utiliza un modelo de **observabilidad distribuida** con los siguientes componentes:

```
┌─────────────────────────┐
│   Aplicación Go         │
│   (Agent con SDK)       │
│                         │
│  ┌──────────────────┐   │
│  │ OpenTelemetry    │   │
│  │ SDK              │   │───┐
│  │ - Tracer         │   │   │ Genera telemetría
│  │ - Meter          │   │   │ internamente
│  │ - Logger         │   │   │
│  └──────────────────┘   │◄──┘
│           │             │
│  ┌──────────────────┐   │
│  │ OTLP Exporter    │   │───┐
│  └──────────────────┘   │   │ Envía datos via OTLP
└───────────┬─────────────┘   │ (cliente, no servidor)
            │                 │
            │ Conexión        │
            │ saliente        │
            ▼                 ▼
    ┌─────────────────────────────┐
    │   OpenTelemetry Collector   │
    │   (Recibe en 4317/4318)     │
    └─────────────────────────────┘
```

### ¿Cómo logra exportar métricas en tiempo real?

El agente implementa el siguiente flujo:

1. **Instrumentación del Código**: La aplicación Go utiliza el SDK de OpenTelemetry para instrumentar su código:
   ```go
   import (
       "go.opentelemetry.io/otel"
       "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
       "go.opentelemetry.io/otel/sdk/trace"
   )
   
   // El agente NO expone puertos, sino que se conecta al Collector
   ```

2. **Generación de Telemetría**: El SDK captura automáticamente:
   - **Trazas (Traces)**: Seguimiento de solicitudes a través de servicios
   - **Métricas (Metrics)**: Contadores, gauges, histogramas de rendimiento
   - **Logs**: Eventos y mensajes de la aplicación

3. **Exportación en Tiempo Real**: El OTLP Exporter del SDK **se conecta al Collector** (actúa como cliente):
   - Se conecta al **Collector en `collector:4317`** (gRPC) o `collector:4318` (HTTP)
   - **NO expone estos puertos**, sino que los consume como cliente
   - Envía los datos en formato OTLP de forma continua

4. **Buffer Interno**: El SDK mantiene un buffer en memoria que:
   - Agrupa datos en lotes (batching) para eficiencia
   - Reintenta envíos fallidos
   - **Puede perder datos** si el buffer se llena y el Collector no está disponible

### Ventajas del Enfoque SDK

- **Contexto Rico**: Captura información detallada desde dentro de la aplicación
- **Bajo Overhead**: El SDK es ligero y optimizado para producción
- **Propagación de Contexto**: Mantiene trace context entre servicios distribuidos
- **Vendor Neutral**: Los datos pueden enviarse a cualquier backend compatible con OTLP

## 2. Persistencia de Trazas Perdidas en Cassandra

### Problema: Pérdida de Trazas por Buffer Lleno del SDK

Cuando el **buffer interno del SDK de Go** se llena (debido a alta carga o el Collector no disponible), las trazas nuevas se pierden porque:

- El SDK tiene memoria limitada para no afectar la aplicación principal
- Si el Collector está caído o lento, el buffer se satura
- El SDK descarta trazas para no consumir toda la RAM

### Solución: Exportador Dual con Fallback a Cassandra

Para evitar pérdida de datos, la aplicación Go debe configurar **múltiples exportadores** en el SDK:

```go
// Configuración del SDK con doble exportación
func initTracer() (*trace.TracerProvider, error) {
    // Exportador principal al Collector (OTLP)
    otlpExporter, err := otlptracegrpc.New(
        context.Background(),
        otlptracegrpc.WithEndpoint("collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    
    // Exportador de respaldo a Cassandra
    cassandraExporter := NewCassandraExporter(&CassandraConfig{
        Hosts:    []string{"cassandra:9042"},
        Keyspace: "otel_traces",
    })
    
    // SpanProcessor con doble exportación
    tp := trace.NewTracerProvider(
        trace.WithBatcher(otlpExporter,
            trace.WithMaxQueueSize(2048),
            trace.WithMaxExportBatchSize(512),
        ),
        // Fallback a Cassandra cuando OTLP falla
        trace.WithSyncer(cassandraExporter),
    )
    
    return tp, nil
}
```

### Estrategias de Implementación

#### Opción 1: Exportador Personalizado a Cassandra (Recomendado)

Implementar un `SpanExporter` custom en Go que escriba directamente a Cassandra:

```go
type CassandraExporter struct {
    session *gocql.Session
}

func (e *CassandraExporter) ExportSpans(ctx context.Context, spans []trace.ReadOnlySpan) error {
    for _, span := range spans {
        query := `INSERT INTO traces_overflow 
                  (trace_id, span_id, timestamp, service_name, operation_name, trace_data)
                  VALUES (?, ?, ?, ?, ?, ?)`
        
        err := e.session.Query(query,
            span.SpanContext().TraceID().String(),
            span.SpanContext().SpanID().String(),
            span.StartTime(),
            span.Resource().Attributes()["service.name"],
            span.Name(),
            marshalSpan(span),
        ).WithContext(ctx).Exec()
        
        if err != nil {
            return err
        }
    }
    return nil
}
```

#### Opción 2: Circuit Breaker con Cola Persistente

Usar un patrón de Circuit Breaker que escriba a Cassandra cuando el Collector falla:

```go
func (a *Agent) exportWithFallback(spans []trace.ReadOnlySpan) error {
    // Intentar enviar al Collector primero
    err := a.otlpExporter.ExportSpans(context.Background(), spans)
    
    if err != nil {
        // Si falla, persistir en Cassandra
        log.Warn("Collector unavailable, falling back to Cassandra")
        return a.cassandraExporter.ExportSpans(context.Background(), spans)
    }
    
    return nil
}
```

### Implementación Recomendada

1. **Esquema en Cassandra**:
   ```cql
   CREATE KEYSPACE IF NOT EXISTS otel_traces 
   WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 3};
   
   CREATE TABLE otel_traces.traces_overflow (
       trace_id text,
       span_id text,
       timestamp timestamp,
       service_name text,
       operation_name text,
       trace_data blob,
       PRIMARY KEY (trace_id, span_id)
   );
   ```

2. **Política de Retención**: Configurar TTL (Time To Live) en Cassandra para eliminar automáticamente trazas antiguas:
   ```cql
   ALTER TABLE otel_traces.traces_overflow 
   WITH default_time_to_live = 604800;  -- 7 días
   ```

3. **Recuperación de Trazas**: Implementar un proceso batch que periódicamente lea las trazas de Cassandra y las reenvíe al Collector cuando esté disponible.

### Beneficios

- ✅ **Sin pérdida de datos**: Todas las trazas se preservan incluso bajo alta carga
- ✅ **Alta disponibilidad**: Cassandra proporciona replicación y tolerancia a fallos
- ✅ **Escalabilidad**: Cassandra puede manejar grandes volúmenes de escrituras
- ✅ **Análisis posterior**: Las trazas persistidas pueden analizarse posteriormente
