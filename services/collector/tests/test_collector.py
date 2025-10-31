"""
Script simple para probar el OpenTelemetry Collector
Envía trazas y métricas al collector en localhost:4317
"""

from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource
import time

def main():
    print("🚀 Iniciando prueba del OpenTelemetry Collector...")
    
    # Configurar recurso (metadatos de la aplicación)
    resource = Resource.create({
        "service.name": "test-app",
        "service.version": "1.0.0",
        "deployment.environment": "dev"
    })
    
    # === CONFIGURAR TRAZAS ===
    print("📊 Configurando exportador de trazas (OTLP gRPC)...")
    trace_exporter = OTLPSpanExporter(
        endpoint="localhost:4317",
        insecure=True  # Sin TLS para pruebas locales
    )
    
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(trace_exporter))
    trace.set_tracer_provider(tracer_provider)
    tracer = trace.get_tracer(__name__)
    
    # === CONFIGURAR MÉTRICAS ===
    print("📈 Configurando exportador de métricas (OTLP gRPC)...")
    metric_exporter = OTLPMetricExporter(
        endpoint="localhost:4317",
        insecure=True
    )
    
    metric_reader = PeriodicExportingMetricReader(
        exporter=metric_exporter,
        export_interval_millis=5000  # Exportar cada 5 segundos
    )
    
    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[metric_reader]
    )
    metrics.set_meter_provider(meter_provider)
    meter = metrics.get_meter(__name__)
    
    # Crear métricas de ejemplo
    request_counter = meter.create_counter(
        "http.requests",
        description="Total de requests HTTP",
        unit="1"
    )
    
    response_time = meter.create_histogram(
        "http.response.time",
        description="Tiempo de respuesta HTTP",
        unit="ms"
    )
    
    # === ENVIAR DATOS DE PRUEBA ===
    print("\n✨ Enviando datos de telemetría al collector...\n")
    
    for i in range(5):
        print(f"🔄 Iteración {i+1}/5")
        
        # Crear una traza (span) de ejemplo
        with tracer.start_as_current_span("test-operation") as span:
            span.set_attribute("iteration", i)
            span.set_attribute("test.type", "smoke-test")
            
            # Simular trabajo
            time.sleep(0.5)
            
            # Crear un span hijo
            with tracer.start_as_current_span("sub-operation") as child_span:
                child_span.set_attribute("nested", True)
                time.sleep(0.2)
        
        # Registrar métricas
        request_counter.add(1, {"method": "GET", "endpoint": "/test"})
        response_time.record(150 + (i * 10), {"method": "GET", "status": "200"})
        
        print(f"  ✅ Traza enviada: test-operation")
        print(f"  ✅ Métrica enviada: http.requests +1")
        print(f"  ✅ Métrica enviada: http.response.time {150 + (i * 10)}ms\n")
        
        time.sleep(1)
    
    # Esperar a que se exporten las métricas finales
    print("⏳ Esperando a que se exporten las métricas finales...")
    time.sleep(6)
    
    print("\n✅ ¡Prueba completada!")
    print("\n📋 Revisa los logs del collector (debería mostrar las trazas y métricas con 'debug' exporter)")
    print("   Para ver los logs: docker logs -f otel-collector")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\n💡 Asegúrate de que:")
        print("   1. El collector está corriendo: docker ps")
        print("   2. El puerto 4317 está expuesto")
        print("   3. Instalaste las dependencias: pip install -r requirements.txt")
