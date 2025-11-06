const express = require('express');
const bodyParser = require('body-parser');
const cassandra = require('cassandra-driver');
const pino = require('pino');

// Logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  },
});

// Express app
const app = express();
app.use(bodyParser.json());

// Cassandra client
const client = new cassandra.Client({
  contactPoints: [process.env.CASSANDRA_HOST || 'cassandra-agent'],
  localDataCenter: process.env.CASSANDRA_DC || 'dc1',
  keyspace: 'pulseops',
  protocolOptions: {
    port: parseInt(process.env.CASSANDRA_PORT || '9042'),
  },
  pooling: {
    coreConnectionsPerHost: {
      [cassandra.types.distance.local]: 2,
      [cassandra.types.distance.remote]: 1,
    },
  },
  socketOptions: {
    connectTimeout: 10000,
    readTimeout: 30000,
  },
  queryOptions: {
    consistency: cassandra.types.consistencies.localOne,  // LOCAL_ONE: escribe en 1 réplica del DC local (funciona cuando edge está aislado)
    prepare: true,
  },
  policies: {
    retry: new cassandra.policies.retry.RetryPolicy(),
  },
});

// Connect to Cassandra
async function connectCassandra() {
  try {
    await client.connect();
    logger.info('Connected to Cassandra cluster');
    
    // Verify keyspace exists
    const keyspaces = await client.execute("SELECT keyspace_name FROM system_schema.keyspaces WHERE keyspace_name = 'pulseops'");
    if (keyspaces.rows.length === 0) {
      logger.error('Keyspace "pulseops" does not exist');
      process.exit(1);
    }

    logger.info('Keyspace "pulseops" verified');
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to connect to Cassandra');
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'cassandra-adapter' });
});

// OTLP HTTP endpoint for metrics
app.post('/v1/metrics', async (req, res) => {
  try {
    const otlpData = req.body;
    
    // Log the received data structure for debugging
    logger.info({ bodyKeys: Object.keys(otlpData), hasResourceMetrics: !!otlpData.resourceMetrics }, 'Received request');
    
    if (!otlpData.resourceMetrics || !Array.isArray(otlpData.resourceMetrics)) {
      logger.error({ receivedBody: JSON.stringify(otlpData).substring(0, 500) }, 'Invalid OTLP metrics format');
      return res.status(400).json({ error: 'Invalid OTLP metrics format' });
    }
    
    logger.info({ count: otlpData.resourceMetrics.length }, 'Received OTLP metrics');
    
    const insertPromises = [];
    
    // Process each resource metric
    for (const resourceMetric of otlpData.resourceMetrics) {
      const resource = resourceMetric.resource || {};
      const resourceAttrs = attributesToObject(resource.attributes || []);
      
      // Extract node_id
      const nodeId = resourceAttrs['node.id'] || resourceAttrs['service.instance.id'] || 'unknown';
      
      // Process scope metrics
      for (const scopeMetric of resourceMetric.scopeMetrics || []) {
        for (const metric of scopeMetric.metrics || []) {
          const metricName = metric.name;
          
          // Process gauge metrics
          if (metric.gauge && metric.gauge.dataPoints) {
            for (const dataPoint of metric.gauge.dataPoints) {
              const timestamp = nanoToDate(dataPoint.timeUnixNano);
              const value = dataPoint.asDouble || dataPoint.asInt || 0;
              const timeBucket = getTimeBucket(timestamp);
              
              const query = `
                INSERT INTO metrics (node_id, metric_name, time_bucket, timestamp, value)
                VALUES (?, ?, ?, ?, ?)
              `;
              
              insertPromises.push(
                client.execute(query, [nodeId, metricName, timeBucket, timestamp, value], { prepare: true })
              );
            }
          }
          
          // Process sum metrics
          if (metric.sum && metric.sum.dataPoints) {
            for (const dataPoint of metric.sum.dataPoints) {
              const timestamp = nanoToDate(dataPoint.timeUnixNano);
              const value = dataPoint.asDouble || dataPoint.asInt || 0;
              const timeBucket = getTimeBucket(timestamp);
              
              const query = `
                INSERT INTO metrics (node_id, metric_name, time_bucket, timestamp, value)
                VALUES (?, ?, ?, ?, ?)
              `;
              
              insertPromises.push(
                client.execute(query, [nodeId, metricName, timeBucket, timestamp, value], { prepare: true })
              );
            }
          }
        }
      }
    }
    
    // Execute all inserts
    await Promise.all(insertPromises);
    
    logger.info({ inserted: insertPromises.length }, 'Metrics written to Cassandra');
    
    res.status(200).json({ status: 'success', inserted: insertPromises.length });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to write metrics to Cassandra');
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Helper: Convert OTLP attributes array to object
function attributesToObject(attributes) {
  const obj = {};
  for (const attr of attributes) {
    if (attr.value.stringValue) obj[attr.key] = attr.value.stringValue;
    else if (attr.value.intValue) obj[attr.key] = attr.value.intValue;
    else if (attr.value.doubleValue) obj[attr.key] = attr.value.doubleValue;
    else if (attr.value.boolValue !== undefined) obj[attr.key] = attr.value.boolValue;
  }
  return obj;
}

// Helper: Convert nanoseconds to Date
function nanoToDate(nanoStr) {
  const millis = parseInt(nanoStr) / 1000000;
  return new Date(millis);
}

// Helper: Get time bucket (day) for partitioning
function getTimeBucket(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Start server
const PORT = process.env.PORT || 8080;

(async () => {
  await connectCassandra();
  
  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Cassandra Adapter started');
  });
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await client.shutdown();
  process.exit(0);
});
