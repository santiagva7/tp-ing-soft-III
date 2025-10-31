"""
Script SIMPLIFICADO para probar el OpenTelemetry Collector
Solo envía métricas básicas de CPU y RAM (fácil de leer)
"""

from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource
import psutil
import time

def main():
    print("🚀 Iniciando prueba SIMPLIFICADA del Collector...")
    print("📊 Solo CPU y RAM (fácil de leer)\n")
    
    # Configurar recurso con customer_id (requerido por el filtro del collector)
    resource = Resource.create({
        "service.name": "test-node",
        "customer.id": "customer-123"  # ⚠️ REQUERIDO por el filtro multi-tenancy
    })
    
    # === CONFIGURAR MÉTRICAS ===
    print("� Configurando exportador de métricas (OTLP gRPC)...")
    try:
        metric_exporter = OTLPMetricExporter(
            endpoint="localhost:4317",
            insecure=True
        )
        
        metric_reader = PeriodicExportingMetricReader(
            exporter=metric_exporter,
            export_interval_millis=3000  # Exportar cada 3 segundos
        )
        
        meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[metric_reader]
        )
        metrics.set_meter_provider(meter_provider)
        meter = metrics.get_meter(__name__)
        
        print("✅ Conexión al collector establecida\n")
    except Exception as e:
        print(f"❌ Error conectando al collector: {e}")
        print("💡 Verifica que el collector esté corriendo en localhost:4317")
        return
    
    # Crear solo 2 métricas: CPU y RAM usando Gauge (valores instantáneos)
    # ObservableGauge lee el valor automáticamente cuando se exporta
    cpu_gauge = meter.create_observable_gauge(
        name="system.cpu.percent",
        description="Porcentaje de CPU usado",
        unit="%",
        callbacks=[lambda options: [metrics.Observation(psutil.cpu_percent(interval=0.1))]]
    )
    
    memory_gauge = meter.create_observable_gauge(
        name="system.memory.percent",
        description="Porcentaje de RAM usada",
        unit="%",
        callbacks=[lambda options: [metrics.Observation(psutil.virtual_memory().percent)]]
    )
    
    # === ENVIAR DATOS ===
    print("✨ Las métricas se exportan automáticamente cada 3 segundos...\n")
    print("💡 ObservableGauge lee CPU/RAM cuando el MetricReader las solicita\n")
    
    try:
        for i in range(10):
            # Los gauges se leen automáticamente, solo mostramos los valores
            cpu = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory().percent
            
            print(f"📊 Iteración {i+1}/10  →  CPU: {cpu:.1f}%  |  RAM: {memory:.1f}%")
            
            time.sleep(2)  # Esperar 2 segundos
    
    except KeyboardInterrupt:
        print("\n⚠️  Interrumpido por el usuario")
    
    # Esperar última exportación
    print("\n⏳ Esperando última exportación...")
    time.sleep(4)
    
    print("\n✅ ¡Prueba completada!")
    print("\n📋 Verificar en el collector:")
    print("   docker logs collector-otel-collector-1 | Select-Object -Last 80")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\n💡 Asegúrate de que:")
        print("   1. El collector está corriendo: docker ps")
        print("   2. El puerto 4317 está expuesto")
        print("   3. Instalaste las dependencias: pip install -r requirements.txt")
