import os
import logging
from flask import Flask, request, jsonify
from cassandra.cluster import Cluster
from datetime import datetime

# --- Configuración ---
# Leemos el host de Cassandra desde una variable de entorno
# Docker Compose se encargará de dársela.
CASSANDRA_HOST = os.environ.get('CASSANDRA_HOST', 'pulseops-db-1')
KEYSPACE = 'pulseops'

# --- Configuración de Logging ---
logging.basicConfig(level=logging.INFO)
log = logging.getLogger('pulseops-backend')

# --- Conexión a Cassandra ---
log.info(f"Conectando a Cassandra en {CASSANDRA_HOST}...")
cluster = Cluster([CASSANDRA_HOST])
# Hacemos que la sesión se reconecte sola si se cae
session = cluster.connect(KEYSPACE)
log.info("Conexión a Cassandra establecida.")

# --- Preparar Queries (más eficiente) ---
insert_metric_query = session.prepare(f"""
    INSERT INTO {KEYSPACE}.metrics (node_id, metric_name, time_bucket, timestamp, value)
    VALUES (?, ?, ?, ?, ?)
""")

select_metrics_query = session.prepare(f"""
    SELECT timestamp, value FROM {KEYSPACE}.metrics
    WHERE node_id = ? AND metric_name = ? AND time_bucket = ?
    LIMIT 100
""")

# --- Servidor Flask ---
app = Flask(__name__)

def get_attribute_value(attributes, key):
    """Función de ayuda para buscar un valor en una lista de atributos OTLP."""
    for attr in attributes:
        if attr.get('key') == key:
            return list(attr.get('value').values())[0]
    return 'unknown'

@app.route("/")
def hello():
    return "PulseOps Backend está vivo."

@app.route("/ingest", methods=["POST"])
def ingest_metric():
    """
    Endpoint para recibir métricas en formato OTLP/JSON.
    """
    try:
        data = request.json
        log.info(f"Dato OTLP recibido: {data}")

        for resource_metric in data.get('resourceMetrics', []):
            resource_attributes = resource_metric.get('resource', {}).get('attributes', [])
            node_id = get_attribute_value(resource_attributes, 'service.name')

            for scope_metric in resource_metric.get('scopeMetrics', []):
                for metric in scope_metric.get('metrics', []):
                    metric_name = metric.get('name')
                    
                    # --- Extraer puntos de datos según el tipo de métrica ---
                    data_points = []
                    if 'gauge' in metric:
                        data_points = metric['gauge'].get('dataPoints', [])
                    elif 'sum' in metric:
                        data_points = metric['sum'].get('dataPoints', [])
                    
                    for dp in data_points:
                        # El timestamp viene en nanosegundos, lo convertimos a datetime
                        timestamp_ns = int(dp.get('timeUnixNano'))
                        timestamp = datetime.fromtimestamp(timestamp_ns / 1e9)
                        
                        value = dp.get('asDouble') or dp.get('asInt')

                        if value is not None:
                            # Creamos el 'bucket' (un bucket por día)
                            time_bucket = timestamp.strftime('%Y-%m-%d')
                            
                            log.info(f"Insertando: {node_id}, {metric_name}, {time_bucket}, {timestamp}, {value}")
                            session.execute(insert_metric_query, [node_id, metric_name, time_bucket, timestamp, value])

        return "OK", 200
        
    except Exception as e:
        log.error(f"Error al ingestar dato OTLP: {e}")
        return "Error", 500

@app.route("/api/metrics/<node_id>/<metric_name>", methods=["GET"])
def get_metrics(node_id, metric_name):
    """
    Endpoint para que el Frontend pida datos.
    """
    try:
        # Por simplicidad, pedimos las métricas del día de hoy
        time_bucket = datetime.utcnow().strftime('%Y-%m-%d')
        
        rows = session.execute(select_metrics_query, [node_id, metric_name, time_bucket])
        
        # Convertimos las filas a un formato JSON amigable
        result = [
            {"time": row.timestamp, "value": row.value}
            for row in rows
        ]
        
        return jsonify(result)
        
    except Exception as e:
        log.error(f"Error al consultar métricas: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Escucha en todas las interfaces (0.0.0.0)
    # para ser accesible desde dentro de Docker
    app.run(host='0.0.0.0', port=5000)