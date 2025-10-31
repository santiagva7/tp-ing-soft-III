# Monitor - Dashboard de Observabilidad Multi-tenant

## 📋 Descripción

**Monitor** es la aplicación de dashboard personalizado que proporciona una interfaz web centralizada para visualizar el estado y métricas de todos los clientes y nodos en tiempo real. Construido sobre Grafana con dashboards personalizados, ofrece una experiencia multi-tenant completa.

## 🎯 Propósito

Proporcionar a tu equipo (proveedor SaaS) una **vista consolidada** de toda la infraestructura de monitoreo, permitiendo:
- Visualización en tiempo real del estado de todos los clientes
- Detección rápida de problemas y anomalías
- Gestión multi-tenant con separación de datos
- Reportes y análisis históricos
- Alertas y notificaciones centralizadas

---

## 🏗️ Arquitectura

```
┌────────────────────────────────────────────────────────┐
│                   MONITOR DASHBOARD                     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │               Grafana Frontend                   │  │
│  │  - Dashboards multi-tenant                       │  │
│  │  - Alertas visuales                              │  │
│  │  - Query routing automático                      │  │
│  └───────────────────┬─────────────────────────────┘  │
│                      │                                  │
│         ┌────────────┴────────────┐                    │
│         │                         │                    │
│  ┌──────▼─────────┐      ┌───────▼────────┐           │
│  │  Datasource    │      │  Datasource    │           │
│  │  Prometheus    │      │  Cassandra     │           │
│  │  (< 30 días)   │      │  (> 30 días)   │           │
│  └────────────────┘      └────────────────┘           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │        Prometheus Scraper (integrado)            │  │
│  │  - Scrappea /health de agentes                   │  │
│  │  - Scrappea métricas del Collector               │  │
│  │  - Ejecuta reglas de alertas                     │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 📊 Dashboards Principales

### 1. **Dashboard Global - Vista Ejecutiva**

```
┌──────────────────────────────────────────────────────────┐
│  🌍 VISTA GLOBAL - Todos los Clientes                    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ Clientes   │  │ Nodos      │  │ Alertas    │        │
│  │   120      │  │   547/550  │  │    3 🔴    │        │
│  │ Total      │  │ Activos    │  │ Activas    │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                           │
│  Estado por Cliente                                       │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Cliente A (Empresa XYZ)      [●●●●○] 4/5 nodos UP │ │
│  │ Cliente B (Startup Inc)      [●●●●●] 5/5 nodos UP │ │
│  │ Cliente C (Corp LLC)         [●●○○○] 2/5 nodos UP │ │
│  │ Cliente D (Tech Co)          [●●●●●] 8/8 nodos UP │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Throughput Global                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 📊 Métricas/s: ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁ 45.3k/s            │ │
│  │ 🔍 Trazas/s:   ▁▁▂▃▃▃▄▅▄▃▃▂▁▁ 12.1k/s            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Alertas Activas                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🔴 Cliente C - Nodo prod-db-01 DOWN (3m)          │ │
│  │ 🟡 Cliente A - Buffer saturado 85% (15m)          │ │
│  │ 🟡 Collector - High CPU 78% (5m)                  │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Queries principales:**

```promql
# Total de clientes activos
count(count by (customer_id) (up{job="customer-agents"}))

# Nodos activos vs total
sum(up{job="customer-agents"}) / count(up{job="customer-agents"})

# Alertas activas por severidad
count(ALERTS{alertstate="firing"}) by (severity)

# Throughput de métricas
sum(rate(otelcol_receiver_accepted_metric_points[5m]))
```

---

### 2. **Dashboard por Cliente**

```
┌──────────────────────────────────────────────────────────┐
│  🏢 Cliente: Empresa XYZ (cliente-a)                     │
│  Selector: [Cliente A ▼]  Período: [Last 24h ▼]         │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Resumen del Cliente                                      │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐            │
│  │ Nodos     │ │ CPU Avg   │ │ RAM Avg   │            │
│  │  4/5 UP   │ │   45.3%   │ │   67.8%   │            │
│  └───────────┘ └───────────┘ └───────────┘            │
│                                                           │
│  Estado de Nodos                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Nodo         Status   CPU    RAM    Uptime         │ │
│  │ prod-web-01  🟢       45%    8.2GB  72d 5h         │ │
│  │ prod-web-02  🟢       52%    7.9GB  72d 5h         │ │
│  │ prod-db-01   🔴       --     --     DOWN            │ │
│  │ prod-cache-  🟡       67%    12GB   15d 2h         │ │
│  │ dev-01       🟢       23%    4.1GB  3d 1h          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Métricas en Tiempo Real                                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │ CPU Usage (%)                                       │ │
│  │ prod-web-01: ▁▂▃▄▃▂▁▂▃▄▅▄▃▂▁                       │ │
│  │ prod-web-02: ▂▃▄▅▆▅▄▃▂▁▂▃▄▃▂                       │ │
│  │ prod-cache:  ▄▅▆▇▇▇▆▅▄▃▄▅▆▇▆                       │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Collector Connectivity                                   │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Latencia al Collector (ms)                          │ │
│  │ P50:  12ms  P95:  25ms  P99:  45ms                 │ │
│  │ ▁▁▁▂▂▃▃▄▄▅▅▄▄▃▃▂▂▁▁▁                              │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Queries principales:**

```promql
# Nodos UP de un cliente específico
sum(up{job="customer-agents",customer_id="cliente-a"})

# CPU promedio por nodo
avg(system_cpu_usage{customer_id="cliente-a"}) by (node_id)

# Memoria usage
system_memory_usage_bytes{customer_id="cliente-a"} / 1024 / 1024 / 1024

# Latencia al Collector
histogram_quantile(0.95, agent_collector_latency_ms{customer_id="cliente-a"})
```

---

### 3. **Dashboard de Nodo Individual**

```
┌──────────────────────────────────────────────────────────┐
│  🖥️  Nodo: prod-web-01 (Cliente A)                       │
│  Selector: [prod-web-01 ▼]  Período: [Last 6h ▼]        │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Estado del Nodo                                          │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐            │
│  │ Status    │ │ Uptime    │ │ Agente    │            │
│  │ 🟢 Healthy│ │ 72d 5h    │ │ v1.0.0    │            │
│  └───────────┘ └───────────┘ └───────────┘            │
│                                                           │
│  System Resources                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ CPU Usage (%)                                       │ │
│  │ 45% ████████████░░░░░░░░░░░░░░░░                   │ │
│  │ ▁▂▃▄▃▂▁▂▃▄▅▄▃▂▁▂▃▄▃▂▁ (last 6h)                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Memory Usage (GB)                                   │ │
│  │ 8.2 / 16 GB (51%) ██████████████░░░░░░░░░░░░░░░░   │ │
│  │ ▃▄▄▄▅▅▅▅▄▄▃▃▄▄▅▅▄▄▃ (last 6h)                      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Disk Usage                                          │ │
│  │ /       125 / 250 GB (50%) ████████████░░░░░░░░░░  │ │
│  │ /var    45 / 100 GB  (45%) ██████████░░░░░░░░░░░░  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Agent Health                                             │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Buffer Usage: 25% (512 / 2048)                     │ │
│  │ Collector Reachable: ✅ Yes (latency: 12ms)        │ │
│  │ Spans Sent: 1.2k/s                                 │ │
│  │ Spans Dropped: 0                                   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Network I/O                                              │
│  ┌────────────────────────────────────────────────────┐ │
│  │ TX: ▂▃▄▅▆▅▄▃▂  2.3 MB/s                           │ │
│  │ RX: ▁▂▂▃▃▂▂▁▁  1.8 MB/s                           │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Queries principales:**

```promql
# CPU del nodo específico
system_cpu_usage{customer_id="cliente-a",node_id="prod-web-01"}

# Memoria
system_memory_usage_bytes{customer_id="cliente-a",node_id="prod-web-01"}

# Buffer del agente
agent_buffer_usage_percent{customer_id="cliente-a",node_id="prod-web-01"}

# Network I/O
rate(system_network_io_bytes{customer_id="cliente-a",node_id="prod-web-01"}[5m])
```

---

### 4. **Dashboard de Alertas**

```
┌──────────────────────────────────────────────────────────┐
│  🔔 ALERTAS ACTIVAS                                      │
│  Filtros: [Severity: All ▼] [Customer: All ▼]           │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Resumen de Alertas                                       │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │ Critical   │ │ Warning    │ │ Info       │          │
│  │    2 🔴    │ │    5 🟡    │ │    3 🔵    │          │
│  └────────────┘ └────────────┘ └────────────┘          │
│                                                           │
│  Alertas Críticas                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🔴 CustomerNodeDown                                 │ │
│  │    Cliente: Cliente C                               │ │
│  │    Nodo: prod-db-01                                 │ │
│  │    Duración: 3m 15s                                 │ │
│  │    [Acknowledge] [Silence] [View Node]             │ │
│  ├────────────────────────────────────────────────────┤ │
│  │ 🔴 CollectorHighMemory                              │ │
│  │    Collector: central-collector                     │ │
│  │    Memory: 475MB / 512MB (93%)                     │ │
│  │    Duración: 1m 45s                                 │ │
│  │    [Acknowledge] [Silence] [View Collector]        │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Alertas Warning                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🟡 AgentBufferSaturated                             │ │
│  │    Cliente: Cliente A, Nodo: prod-web-02            │ │
│  │    Buffer: 85%                                      │ │
│  │    Duración: 15m 30s                                │ │
│  ├────────────────────────────────────────────────────┤ │
│  │ 🟡 HighCPUUsage                                     │ │
│  │    Cliente: Cliente B, Nodo: prod-app-01            │ │
│  │    CPU: 87%                                         │ │
│  │    Duración: 8m 12s                                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Timeline de Alertas (últimas 24h)                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 00:00  04:00  08:00  12:00  16:00  20:00  24:00   │ │
│  │   |      |      |      |█     |      |      |      │ │
│  │ Critical:        ▁█▁   ██    ▁                     │ │
│  │ Warning:   ▁▁▁▁██████████▁▁▁▁                      │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Queries principales:**

```promql
# Alertas activas por severidad
count(ALERTS{alertstate="firing"}) by (severity)

# Alertas por cliente
count(ALERTS{alertstate="firing"}) by (customer_id)

# Duración de alertas
ALERTS{alertstate="firing"}
```

---

### 5. **Dashboard de Infraestructura (SRE)**

```
┌──────────────────────────────────────────────────────────┐
│  ⚙️  INFRAESTRUCTURA - Vista SRE                         │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Collector Performance                                    │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Ingesta Rate: 45.3k metrics/s, 12.1k traces/s      │ │
│  │ Processing Latency: P50: 5ms, P95: 15ms, P99: 35ms│ │
│  │ Memory: 387MB / 512MB (75%)                        │ │
│  │ CPU: 12 cores @ 45% avg                            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Storage Layer                                            │
│  ┌─────────────────────┐ ┌─────────────────────────┐   │
│  │ Prometheus (Hot)    │ │ Cassandra (Cold)        │   │
│  │ - Disk: 450/1000 GB │ │ - Disk: 2.1/5.0 TB      │   │
│  │ - Queries: 250/s    │ │ - Queries: 15/s         │   │
│  │ - Latency: 120ms    │ │ - Latency: 850ms        │   │
│  │ - Retention: 30d    │ │ - Retention: 2y         │   │
│  └─────────────────────┘ └─────────────────────────┘   │
│                                                           │
│  Cassandra Cluster Health                                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Node 1: 🟢 UP   Load: 350GB  CPU: 45%  RAM: 28GB  │ │
│  │ Node 2: 🟢 UP   Load: 345GB  CPU: 42%  RAM: 27GB  │ │
│  │ Node 3: 🟢 UP   Load: 355GB  CPU: 48%  RAM: 29GB  │ │
│  │ Replication Factor: 3  Consistency: QUORUM         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  Network Traffic                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Inbound (Collector):  ▃▄▅▆▇▇▆▅▄▃  15 MB/s         │ │
│  │ Outbound (Exporters): ▂▃▃▄▄▃▃▂▁▁  8 MB/s          │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  grafana:
    image: grafana/grafana:latest
    container_name: monitor-grafana
    ports:
      - "3000:3000"
    environment:
      # Configuración básica
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-changeme}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_USERS_ALLOW_ORG_CREATE=false
      
      # Multi-tenancy
      - GF_AUTH_ANONYMOUS_ENABLED=false
      - GF_ORG_NAME=Monitor SaaS
      
      # Datasources
      - GF_DATASOURCES_DEFAULT_NAME=Prometheus-Hot
    volumes:
      # Dashboards predefinidos
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources
      - ./grafana/alerting:/etc/grafana/provisioning/alerting
      
      # Persistencia de datos
      - grafana-data:/var/lib/grafana
      
      # Plugins personalizados
      - ./grafana/plugins:/var/lib/grafana/plugins
    networks:
      - observability
    restart: unless-stopped
    depends_on:
      - prometheus
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

  prometheus:
    image: prom/prometheus:latest
    container_name: monitor-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
      - '--web.enable-admin-api'
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/alerts:/etc/prometheus/alerts
      - prometheus-data:/prometheus
    networks:
      - observability
    restart: unless-stopped

volumes:
  grafana-data:
  prometheus-data:

networks:
  observability:
    external: true
```

### Configuración de Datasources

```yaml
# grafana/datasources/datasources.yml
apiVersion: 1

datasources:
  # Prometheus (Hot Storage - últimos 30 días)
  - name: Prometheus-Hot
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: "15s"
      queryTimeout: "30s"
      httpMethod: "POST"
    editable: false
  
  # Cassandra (Cold Storage - histórico > 30 días)
  - name: Cassandra-Cold
    type: hadesarchitect-cassandra-datasource
    access: proxy
    url: http://cassandra-adapter:9042
    jsonData:
      keyspace: "observability"
      consistency: "ONE"
      timeout: "30s"
    editable: false
```

### Provisioning de Dashboards

```yaml
# grafana/dashboards/dashboards.yml
apiVersion: 1

providers:
  - name: 'Monitor Dashboards'
    orgId: 1
    folder: 'Monitor'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: true
```

---

## 🔔 Alertas y Notificaciones

### Configuración de Alertmanager

```yaml
# grafana/alerting/alerting.yml
apiVersion: 1

contactPoints:
  - orgId: 1
    name: email-oncall
    receivers:
      - uid: email-oncall
        type: email
        settings:
          addresses: oncall@tuempresa.com
  
  - orgId: 1
    name: slack-critical
    receivers:
      - uid: slack-critical
        type: slack
        settings:
          url: ${SLACK_WEBHOOK_URL}
          text: '{{ template "slack.default.text" . }}'
  
  - orgId: 1
    name: pagerduty
    receivers:
      - uid: pagerduty
        type: pagerduty
        settings:
          integrationKey: ${PAGERDUTY_KEY}

policies:
  - orgId: 1
    receiver: email-oncall
    group_by: ['alertname', 'customer_id']
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - matchers:
          - severity = critical
        receiver: slack-critical
        continue: true
      - matchers:
          - severity = critical
          - alertname =~ ".*Down"
        receiver: pagerduty
```

---

## 🔐 Autenticación y Multi-tenancy

### Usuarios y Roles

```yaml
# grafana/provisioning/access-control/users.yml
apiVersion: 1

users:
  # Admin global
  - name: Admin SaaS
    email: admin@tuempresa.com
    login: admin
    password: ${ADMIN_PASSWORD}
    orgId: 1
    role: Admin
  
  # SRE team
  - name: SRE Team
    email: sre@tuempresa.com
    login: sre
    password: ${SRE_PASSWORD}
    orgId: 1
    role: Editor
  
  # Support team (solo lectura)
  - name: Support
    email: support@tuempresa.com
    login: support
    password: ${SUPPORT_PASSWORD}
    orgId: 1
    role: Viewer
```

### Organizaciones por Cliente (Opcional)

```yaml
# Para clientes que necesitan acceso a sus propios dashboards
organizations:
  - name: "Cliente A - Empresa XYZ"
    id: 2
    users:
      - email: admin@empresa-xyz.com
        role: Admin
        # Solo ve datos de customer_id="cliente-a"
```

---

## 📈 Métricas del Dashboard

### Métricas de Uso

```promql
# Usuarios activos en Grafana
grafana_stat_active_users

# Dashboards más visitados
topk(10, sum by (dashboard) (rate(grafana_dashboard_views_total[1h])))

# Queries más lentas
topk(10, grafana_datasource_request_duration_seconds{quantile="0.99"})

# Errores de queries
rate(grafana_datasource_request_errors_total[5m])
```

---

## 🔍 Troubleshooting

### Problema: Dashboards no cargan

```bash
# 1. Verificar logs de Grafana
docker logs monitor-grafana | tail -100

# 2. Verificar datasources
curl http://admin:password@localhost:3000/api/datasources

# 3. Test query directa a Prometheus
curl http://localhost:9090/api/v1/query?query=up

# 4. Verificar provisioning
docker exec monitor-grafana ls -la /etc/grafana/provisioning/dashboards
```

### Problema: Queries lentas

```bash
# 1. Ver queries más lentas en Grafana
# Settings > Data Sources > Prometheus > Query Inspector

# 2. Optimizar queries con recording rules
# prometheus/alerts/recording-rules.yml

# 3. Aumentar recursos de Prometheus
# docker update --memory=8g --cpus=4 monitor-prometheus
```

### Problema: Alertas no se envían

```bash
# 1. Verificar configuración de contact points
curl http://admin:password@localhost:3000/api/v1/provisioning/contact-points

# 2. Test manual de notificación
curl -X POST http://admin:password@localhost:3000/api/v1/provisioning/contact-points/test \
  -H "Content-Type: application/json" \
  -d '{"uid": "email-oncall"}'

# 3. Ver logs de alerting
docker logs monitor-grafana | grep alerting
```

---

## 🎨 Personalización

### Temas Personalizados

```yaml
# grafana/grafana.ini
[server]
root_url = https://monitor.tuempresa.com

[branding]
app_title = Monitor SaaS
logo_url = /public/img/logo-custom.png
footer_links = []

[theme]
default_theme = dark
```

### Plugins Recomendados

```bash
# Instalar plugins útiles
docker exec monitor-grafana grafana-cli plugins install grafana-worldmap-panel
docker exec monitor-grafana grafana-cli plugins install grafana-piechart-panel
docker exec monitor-grafana grafana-cli plugins install grafana-clock-panel
docker exec monitor-grafana grafana-cli plugins install hadesarchitect-cassandra-datasource

# Reiniciar Grafana
docker restart monitor-grafana
```

---

## 📚 Referencias

- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)
- [Dashboard Best Practices](https://grafana.com/docs/grafana/latest/best-practices/best-practices-for-creating-dashboards/)
- [Alerting Guide](https://grafana.com/docs/grafana/latest/alerting/)
- [Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)

---

## 🎯 Checklist de Deployment

- [ ] Grafana desplegado y accesible
- [ ] Datasources configurados (Prometheus, Cassandra)
- [ ] Dashboards provisionados
- [ ] Alertas configuradas
- [ ] Contact points definidos
- [ ] Usuarios y roles creados
- [ ] Autenticación habilitada
- [ ] Backups configurados
- [ ] SSL/TLS configurado (producción)
- [ ] Dominio personalizado configurado

---

**Versión**: 1.0.0
**Última actualización**: Octubre 31, 2025
