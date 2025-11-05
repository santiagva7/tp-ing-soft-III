export default function Home() {
  // Leer del .env (estas variables están disponibles en el servidor)
  const customerId = process.env.CUSTOMER_ID || 'N/A'
  const serviceName = process.env.OTEL_SERVICE_NAME || 'pulse-ops-node'
  const collectorEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317'

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            📡 Monitoring Agent
          </h1>
          <p className="text-gray-400">
            OpenTelemetry Data Collector
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 bg-green-900/30 border border-green-500/50 text-green-400 px-6 py-3 rounded-full">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-semibold">Enviando datos activamente</span>
          </div>
        </div>

        {/* Info Cards */}
        <div className="space-y-4">
          {/* Customer ID */}
          <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Customer ID</p>
                <p className="text-2xl font-bold text-white">{customerId}</p>
              </div>
              <div className="text-4xl">👤</div>
            </div>
          </div>

          {/* Service Name */}
          <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm mb-1">Service Name</p>
                <p className="text-xl font-mono text-blue-400">{serviceName}</p>
              </div>
              <div className="text-4xl">🏷️</div>
            </div>
          </div>

          {/* Collector Endpoint */}
          <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-gray-400 text-sm mb-1">Collector Endpoint</p>
                <p className="text-sm font-mono text-green-400 break-all">{collectorEndpoint}</p>
              </div>
              <div className="text-4xl ml-4">🎯</div>
            </div>
          </div>
        </div>

        {/* Metrics Info */}
        <div className="mt-8 bg-blue-900/20 border border-blue-500/30 rounded-lg p-5">
          <h3 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
            <span>📊</span>
            <span>Métricas Enviadas</span>
          </h3>
          <ul className="text-gray-300 text-sm space-y-2">
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span>
              <span>system.cpu.percent</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span>
              <span>system.memory.percent</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span>
              <span>process.memory.usage</span>
            </li>
          </ul>
          <p className="text-gray-400 text-xs mt-4">
            ⏱️ Exportando cada 5 segundos vía OTLP/gRPC
          </p>
        </div>

        {/* Footer Info */}
        <div className="mt-6 pt-6 border-t border-gray-700 text-center">
          <p className="text-gray-500 text-sm">
            Los datos se están enviando automáticamente al collector.
            <br />
            Verifica en Grafana: <span className="text-blue-400 font-mono">localhost:3000</span>
          </p>
        </div>
      </div>
    </div>
  );
}
