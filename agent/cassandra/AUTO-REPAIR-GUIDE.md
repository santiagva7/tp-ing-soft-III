# Auto-Repair Configuration for Cassandra Edge Node

## 🎯 Overview

This setup implements **Opción 5 (Hybrid)** for automatic data synchronization when the edge node reconnects to the cluster after a network partition.

### Components:

1. **Consistency Level = ONE** in cassandra-adapter (allows writes when isolated)
2. **Read Repair (20%)** passive background synchronization
3. **Health Monitor sidecar** active repair on reconnection

---

## 🚀 How It Works

### Normal Operation:
```
pulse-ops-node → collector → cassandra-adapter (CL=ONE) → cassandra-agent
                                                              ↓
                                                         (replicates to cluster)
```

### During Network Partition:
```
pulse-ops-node → collector → cassandra-adapter (CL=ONE) → cassandra-agent (isolated)
                                                              ↓
                                                         (data stored locally only)
```

### After Reconnection:
```
cassandra-agent reconnects → Health Monitor detects → nodetool repair executes
                              ↓
                         (data syncs to all replicas)
```

---

## � Data Distribution During Isolation

### ⚠️ Important: CL=ONE and Token Ranges

When the edge node is isolated and writes with CL=ONE, data is stored **locally only**, but may not belong to the node's token range according to Cassandra's consistent hashing.

**Example:**
```
Cluster Token Ring (RF=3):
  cassandra-1: 0-25%    (Primary for 25% of keys)
  cassandra-2: 25-50%   (Primary for 25% of keys)
  cassandra-3: 50-75%   (Primary for 25% of keys)
  cassandra-agent: 75-100% (Primary for 25% of keys)

During isolation, edge node writes 1000 records:
  - ~250 records: Belong to agent's range (75-100%) ✅
  - ~750 records: Belong to other nodes' ranges ⚠️ (orphaned data)
```

### 🔧 How Full Repair Solves This:

```bash
nodetool repair pulseops  # WITHOUT -pr flag
```

**What happens:**
1. For each record in cassandra-agent:
   - Calculate: Which node should be primary? (via partition key hash)
   - If agent IS primary → Sync to replicas (cassandra-1, 2, 3)
   - If agent is NOT primary → Stream to actual primary + replicas
   
2. Result: All data ends up in correct nodes according to RF=3

**Duration:** 
- Small dataset (< 10K records): ~2-5 minutes
- Medium dataset (100K records): ~10-20 minutes
- Large dataset (1M+ records): ~30-60 minutes

---

## �🔧 Configuration Details

### 1. Consistency Level = ONE
**File:** `services/agent/collector/cassandra-adapter/src/index.js`

```javascript
queryOptions: {
  consistency: cassandra.types.consistencies.one,
  prepare: true,
}
```

**Effect:** Writes succeed even when only 1 replica (the edge node) is available.

---

### 2. Read Repair (20%)
**Configured in:** `cassandra-agent-init` service

```sql
ALTER TABLE pulseops.metrics WITH dclocal_read_repair_chance = 0.2;
```

**Effect:** 
- 20% of reads automatically trigger background repair
- Cassandra compares replicas and fixes inconsistencies
- Low overhead, passive synchronization

---

### 3. Health Monitor Sidecar
**File:** `services/agent/cassandra/health-monitor.sh`

**Monitors:**
- Node status every 30 seconds (configurable via `CHECK_INTERVAL`)
- Detects state transitions: DOWN → UP

**Actions:**
- When reconnection detected: executes `nodetool repair pulseops` (full keyspace repair)
- Syncs **ALL data** written during isolation (not just primary range)
- Critical for CL=ONE writes that may have been written to wrong token ranges
- Logs all actions to stdout (visible via `docker logs`)
- Prevents concurrent repairs with lock mechanism

---

## 🧪 Testing the Auto-Repair

### Step 1: Start the cluster

```bash
# Start central cluster
cd services/storage/cassandra
docker compose up -d

# Start edge node with health monitor
cd ../../agent/cassandra
docker compose up -d
```

### Step 2: Verify initial state

```bash
# Check cluster status (all nodes should be UP)
docker exec -it pulseops-agent-cassandra nodetool status

# Expected output:
# UN (Up/Normal) for all nodes including cassandra-agent
```

### Step 3: Simulate network partition

```bash
# Disconnect edge node from cluster network
docker network disconnect cassandra_cassandra-net pulseops-agent-cassandra

# Verify isolation
docker exec -it pulseops-db-1 nodetool status
# cassandra-agent should show as DN (Down/Normal)
```

### Step 4: Write data while isolated

```bash
# The pulse-ops-node app will continue writing metrics locally
# You can verify by checking logs:
docker logs pulseops-agent-cassandra-adapter -f

# Writes should succeed with CL=ONE
```

### Step 5: Reconnect the node

```bash
# Reconnect edge node to cluster
docker network connect cassandra_cassandra-net pulseops-agent-cassandra

# Watch health monitor logs
docker logs -f pulseops-agent-health-monitor

# Expected output:
# Estado actual: DOWN (previo: DOWN)
# Estado actual: UP (previo: DOWN)
# 🔄 ¡Reconexión detectada! Nodo volvió a estar UP
# 🔧 Ejecutando repair en keyspace pulseops...
# ✅ Repair completado exitosamente
```

### Step 6: Verify data synchronization

```bash
# Check that data is now replicated
docker exec -it pulseops-db-1 cqlsh -e "
  SELECT COUNT(*) FROM pulseops.metrics 
  WHERE node_id = '$(docker exec pulseops-agent-cassandra hostname)' 
    AND metric_name = 'system.cpu.percent' 
    AND time_bucket = '$(date +%Y-%m-%d)';
"

# Should show metrics written during isolation
```

---

## 📊 Monitoring

### Health Monitor Logs
```bash
docker logs -f pulseops-agent-health-monitor
```

**Key messages:**
- `Estado actual: UP` - Node is connected
- `Estado actual: DOWN` - Node is isolated
- `🔄 ¡Reconexión detectada!` - Reconnection event
- `✅ Repair completado exitosamente` - Repair finished

### Repair Progress
```bash
docker exec -it pulseops-agent-cassandra nodetool netstats

# Shows active streaming operations during repair
```

### Read Repair Stats
```bash
docker exec -it pulseops-agent-cassandra nodetool tablestats pulseops.metrics

# Look for "Local read repair count" in output
```

---

## 🔍 Troubleshooting

### Issue: Health monitor not detecting reconnection

**Check:**
```bash
# Verify health monitor is running
docker ps --filter "name=health-monitor"

# Check environment variables
docker inspect pulseops-agent-health-monitor | grep -A5 "Env"

# Verify script permissions
docker exec pulseops-agent-health-monitor ls -l /usr/local/bin/health-monitor.sh
```

**Fix:** Ensure script has execute permissions and CHECK_INTERVAL is reasonable (30-60s).

---

### Issue: Repair fails with timeout

**Check:**
```bash
# View repair logs
docker exec pulseops-agent-cassandra cat /tmp/repair.log

# Check cluster connectivity
docker exec pulseops-agent-cassandra nodetool describecluster
```

**Fix:** 
- Increase repair timeout in cassandra.yaml
- Reduce data volume (use time-based repair)
- Check network latency between nodes

---

### Issue: Writes still fail with CL=ONE

**Check:**
```bash
# Verify adapter configuration
grep "consistency" services/agent/collector/cassandra-adapter/src/index.js

# Test direct write
docker exec -it pulseops-agent-cassandra cqlsh -e "
  INSERT INTO pulseops.metrics (node_id, metric_name, time_bucket, timestamp, value)
  VALUES ('test', 'test.metric', '2025-11-05', toTimestamp(now()), 42.0);
"
```

**Fix:** Rebuild adapter container to apply CL=ONE change:
```bash
cd services/agent/collector
docker compose up -d --build cassandra-adapter
```

---

## 📈 Performance Considerations

### Read Repair Overhead:
- **20% chance** means 1 in 5 reads trigger repair
- Minimal impact on read latency (< 5ms typically)
- Can be adjusted: 0.1 (10%) for less overhead, 0.5 (50%) for more aggressive repair

### Repair Duration:
- Depends on data volume and network bandwidth
- Small datasets (< 1GB): 1-5 minutes
- Large datasets (> 10GB): 30+ minutes
- Use `-pr` (primary range) for efficiency

### Resource Usage:
- Repair is CPU and network intensive
- Schedule during low-traffic periods if possible
- Health monitor uses minimal resources (< 10MB RAM)

---

## 🎯 Best Practices

1. **Monitor repair logs regularly**
   ```bash
   docker logs pulseops-agent-health-monitor | grep "Repair"
   ```

2. **Verify read repair is active**
   ```bash
   docker exec -it pulseops-agent-cassandra nodetool getcompactionthroughput
   ```

3. **Test isolation scenarios periodically**
   - Disconnect node
   - Write data
   - Reconnect
   - Verify data appears on all replicas

4. **Adjust CHECK_INTERVAL based on requirements**
   - Shorter (15s): Faster detection, more overhead
   - Longer (60s): Lower overhead, slower detection

5. **Full repair vs Primary Range repair**
   - Full repair (`nodetool repair keyspace`): Syncs ALL data, necessary for CL=ONE edge writes
   - Primary range (`-pr` flag): Only syncs data owned by node, faster but incomplete
   - **Current config uses full repair** to handle orphaned data from isolation

6. **Consider cleanup after prolonged isolation**
   - If edge node accumulated significant orphaned data (>1GB)
   - Run `nodetool cleanup pulseops` after full repair completes
   - This removes data that doesn't belong to the node's token range
   - Frees disk space but requires repair to run first

---

## 🚀 Next Steps

After validating the auto-repair setup:

1. **Run load tests** to verify performance under network partitions
2. **Monitor metrics** for repair frequency and duration
3. **Tune read_repair_chance** based on consistency requirements
4. **Set up alerting** for prolonged network partitions (> 1 hour)

---

## 📚 References

- [Cassandra Repair Documentation](https://cassandra.apache.org/doc/latest/operating/repair.html)
- [Read Repair](https://cassandra.apache.org/doc/latest/operating/read_repair.html)
- [Consistency Levels](https://cassandra.apache.org/doc/latest/architecture/dynamo.html#consistency-levels)
