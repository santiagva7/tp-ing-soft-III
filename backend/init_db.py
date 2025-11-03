import time
from cassandra.cluster import Cluster
from cassandra.policies import DCAwareRoundRobinPolicy
from cassandra.auth import PlainTextAuthProvider
from cassandra.query import SimpleStatement
import logging

logging.basicConfig(level=logging.INFO)

log = logging.getLogger()
log.setLevel('INFO')

# --- Configuración ---
CASSANDRA_HOST = 'cassandra'  # Docker expone el puerto 9042 a tu PC
KEYSPACE = 'pulseops'
REPLICATION_FACTOR = 1
# ---------------------

def create_keyspace(session):
    """Crea el Keyspace (la base de datos)"""
    log.info(f"Creando keyspace: {KEYSPACE}...")
    try:
        session.execute(f"""
            CREATE KEYSPACE IF NOT EXISTS {KEYSPACE}
            WITH replication = {{ 'class': 'SimpleStrategy', 'replication_factor': {REPLICATION_FACTOR} }}
        """)
        log.info("Keyspace creado con éxito.")
    except Exception as e:
        log.error(f"Error creando keyspace: {e}")
        raise

def create_tables(session):
    """Crea la tabla de métricas"""
    log.info("Creando tabla 'metrics'...")
    try:
        session.execute(f"""
            CREATE TABLE IF NOT EXISTS {KEYSPACE}.metrics (
                node_id text,
                metric_name text,
                time_bucket text,  -- Un 'bucket' por día, ej: '2025-10-27'
                timestamp timestamp,
                value double,
                PRIMARY KEY ((node_id, metric_name, time_bucket), timestamp)
            ) WITH CLUSTERING ORDER BY (timestamp DESC);
        """)
        log.info("Tabla 'metrics' creada con éxito.")
    except Exception as e:
        log.error(f"Error creando tabla: {e}")
        raise

def main():
    log.info(f"Intentando conectar a Cassandra en {CASSANDRA_HOST}...")
    cluster = Cluster([CASSANDRA_HOST])
    session = None
    
    # Cassandra puede tardar en arrancar. Hacemos 5 reintentos.
    for i in range(5):
        try:
            session = cluster.connect()
            log.info("¡Conexión exitosa!")
            break
        except Exception as e:
            log.warning(f"Intento {i+1}/5 fallido. Reintentando en 5 segundos... Error: {e}")
            time.sleep(5)
            
    if not session:
        log.error("No se pudo conectar a Cassandra después de varios intentos.")
        return

    try:
        create_keyspace(session)
        session.set_keyspace(KEYSPACE) # Nos cambiamos al keyspace que creamos
        create_tables(session)
        log.info("¡Base de datos inicializada correctamente!")
    except Exception as e:
        log.error(f"Ocurrió un error durante la inicialización: {e}")
    finally:
        session.shutdown()
        cluster.shutdown()
        log.info("Conexión cerrada.")

if __name__ == "__main__":
    main()