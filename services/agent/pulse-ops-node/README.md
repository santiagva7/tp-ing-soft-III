# Pulse Ops Node - Next.js Agent

Agente de monitoreo construido con Next.js 16 y OpenTelemetry para recolectar métricas de sistema (CPU, RAM).

## 📋 Prerequisitos

- Node.js 18+
- OpenTelemetry Collector corriendo en `localhost:4317` (gRPC)

## 🚀 Inicio Rápido

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.local.example .env.local
# Editar .env.local con tus valores

# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

## 📊 Métricas Recolectadas

- `system.cpu.percent` - Porcentaje de uso de CPU
- `system.memory.percent` - Porcentaje de uso de RAM

Las métricas se exportan cada **5 segundos** al OpenTelemetry Collector vía OTLP/gRPC.

## 🔧 Configuración

Variables de entorno en `.env.local`:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=pulse-ops-node
CUSTOMER_ID=customer-123
NODE_ENV=development
```

## 📁 Estructura

```
pulse-ops-node/
├── app/                    # Next.js App Router
│   └── page.tsx           # Home page
├── lib/
│   ├── otel.ts            # OpenTelemetry SDK setup
│   └── metrics.ts         # System metrics (CPU, RAM)
├── instrumentation.ts     # Next.js instrumentation hook
└── .env.local            # Variables de entorno
```

## 🧪 Verificar que Funciona

Al ejecutar `npm run dev` deberías ver:

```
🚀 Inicializando OpenTelemetry...
✅ OpenTelemetry inicializado correctamente
   📡 Collector: http://localhost:4317
   🏷️  Service: pulse-ops-node
   👤 Customer: customer-123
📊 Registrando métricas del sistema...
✅ Métricas del sistema registradas (CPU, RAM)
[HH:MM:SS] 📊 system.cpu.percent: XX.XX%
[HH:MM:SS] 📊 system.memory.percent: XX.XX%
```

Cada 5 segundos verás nuevos logs con las métricas actualizadas.

