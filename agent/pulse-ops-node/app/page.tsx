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
            Monitoring Agent
          </h1>
          <p className="text-gray-400">
            OpenTelemetry Data Collector
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 bg-green-900/30 border border-green-500/50 text-green-300 px-6 py-3 rounded-full">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-semibold">Enviando datos activamente</span>
          </div>
        </div>

        {/* Metrics Info */}
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-5">
          <h3 className="text-blue-400 font-semibold mb-3">
            Métricas Enviadas
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
            Exportando cada 5 segundos vía OTLP/gRPC
          </p>
        </div>

        {/* Architecture Diagram */}
        <div className="mt-8 bg-purple-900/20 border border-purple-500/30 rounded-lg p-5">
          <h3 className="text-purple-400 font-semibold mb-4">
            Arquitectura Edge Node
          </h3>
          
          {/* Flow Diagram */}
          <div className="space-y-3">
            {/* This Agent */}
            <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-blue-300 font-semibold text-sm">Pulse-Ops Node</span>
                <span className="text-gray-500 text-xs ml-auto">Este servicio</span>
              </div>
              <p className="text-gray-400 text-xs mt-1 ml-4">Genera métricas del sistema</p>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="text-gray-500 text-xl">↓</div>
            </div>

            {/* OTLP Collector */}
            <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-300 font-semibold text-sm">OTLP Collector</span>
              </div>
              <p className="text-gray-400 text-xs mt-1 ml-4">Recibe telemetría OTLP (4317/4318)</p>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="text-gray-500 text-xl">↓</div>
            </div>

            {/* Cassandra Adapter */}
            <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-yellow-300 font-semibold text-sm">Cassandra Adapter</span>
              </div>
              <p className="text-gray-400 text-xs mt-1 ml-4">Transforma y escribe en Cassandra</p>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="text-gray-500 text-xl">↓</div>
            </div>

            {/* Cassandra Agent */}
            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-red-300 font-semibold text-sm">Cassandra Agent (dc2)</span>
              </div>
              <p className="text-gray-400 text-xs mt-1 ml-4">Almacenamiento local + replicación a dc1</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-purple-500/30">
            <p className="text-gray-400 text-xs">
              Todos los componentes están en el mismo edge node para operación autónoma durante aislamiento de red.
            </p>
          </div>
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
