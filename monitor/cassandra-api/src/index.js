const express = require('express');
const cors = require('cors');
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

const app = express();
app.use(cors());
app.use(express.json());

// Cassandra client
const client = new cassandra.Client({
  contactPoints: [process.env.CASSANDRA_HOST || 'pulseops-db-1'],
  localDataCenter: process.env.CASSANDRA_DC || 'dc1',
  keyspace: 'pulseops',
  protocolOptions: {
    port: parseInt(process.env.CASSANDRA_PORT || '9042'),
  },
});

// Connect to Cassandra
async function connectCassandra() {
  try {
    await client.connect();
    logger.info('Connected to Cassandra cluster');
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to connect to Cassandra');
    process.exit(1);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'cassandra-api-gateway' });
});

// ============================================
// HELPER FUNCTIONS (Strategy Pattern)
// ============================================

// Generate time buckets for date range
function generateTimeBuckets(fromDate, toDate) {
  const timeBuckets = [];
  const currentDate = new Date(fromDate);
  while (currentDate <= toDate) {
    timeBuckets.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return timeBuckets;
}

// Generic function to fetch metric data
async function getMetricData(metricName, fromDate, toDate, logContext) {
  logger.info({
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
    metricName
  }, `[${logContext}] Date range parsed`);
  
  const timeBuckets = generateTimeBuckets(fromDate, toDate);
  
  logger.info({ timeBuckets, count: timeBuckets.length }, `[${logContext}] Time buckets generated`);
  
  const allDatapoints = [];
  
  // Query each day
  for (const timeBucket of timeBuckets) {
    const query = `
      SELECT timestamp, value, node_id
      FROM metrics 
      WHERE metric_name = ? 
        AND time_bucket = ?
        AND timestamp >= ?
        AND timestamp <= ?
      ALLOW FILTERING
    `;
    
    try {
      const result = await client.execute(
        query,
        [metricName, timeBucket, fromDate, toDate],
        { prepare: true }
      );
      
      result.rows.forEach(row => {
        allDatapoints.push({
          timestamp: row.timestamp.getTime(),
          value: row.value,
          node_id: row.node_id
        });
      });
    } catch (err) {
      logger.warn({ error: err.message, timeBucket }, 'Failed to query time bucket');
    }
  }
  
  // Sort by timestamp
  allDatapoints.sort((a, b) => a.timestamp - b.timestamp);
  
  logger.info({ 
    totalDatapoints: allDatapoints.length,
    sample: allDatapoints[0]
  }, `[${logContext}] All datapoints collected`);
  
  return allDatapoints;
}

// Format datapoints for Infinity datasource
function formatResponse(datapoints) {
  return datapoints.map(dp => ({
    Time: dp.timestamp,
    Value: dp.value,
    node_id: dp.node_id
  }));
}

// ============================================
// ENDPOINT 1: CPU Metrics
// ============================================
app.get('/api/cpu', async (req, res) => {
  try {
    const { from, to } = req.query;
    
    logger.info({ 
      rawParams: { from, to },
      type: { from: typeof from, to: typeof to }
    }, '[CPU] Request received');
    
    const fromDate = new Date(parseInt(from));
    const toDate = new Date(parseInt(to));
    
    // Use strategy pattern: generic metric fetching
    const datapoints = await getMetricData('system.cpu.percent', fromDate, toDate, 'CPU');
    
    // Format response
    const response = formatResponse(datapoints);
    
    logger.info({ 
      pointCount: response.length,
      firstPoint: response[0],
      lastPoint: response[response.length - 1]
    }, '[CPU] Response prepared');
    
    res.json(response);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to fetch CPU metrics');
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT 2: Memory Metrics
// ============================================
app.get('/api/memory', async (req, res) => {
  try {
    const { from, to } = req.query;
    
    logger.info({ 
      rawParams: { from, to },
      type: { from: typeof from, to: typeof to }
    }, '[MEMORY] Request received');
    
    const fromDate = new Date(parseInt(from));
    const toDate = new Date(parseInt(to));
    
    // Use strategy pattern: generic metric fetching
    const datapoints = await getMetricData('system.memory.percent', fromDate, toDate, 'MEMORY');
    
    // Format response
    const response = formatResponse(datapoints);
    
    logger.info({ 
      pointCount: response.length,
      firstPoint: response[0],
      lastPoint: response[response.length - 1]
    }, '[MEMORY] Response prepared');
    
    res.json(response);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to fetch Memory metrics');
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3002;

(async () => {
  await connectCassandra();
  
  app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, '🚀 Cassandra API Gateway started');
    logger.info('📊 Available endpoints:');
    logger.info('  GET /health');
    logger.info('  GET /api/cpu?from=<timestamp>&to=<timestamp>');
    logger.info('  GET /api/memory?from=<timestamp>&to=<timestamp>');
  });
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await client.shutdown();
  process.exit(0);
});
