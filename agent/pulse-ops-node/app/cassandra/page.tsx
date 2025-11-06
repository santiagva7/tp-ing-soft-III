export default function CassandraArchitecture() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-8">
      <div className="max-w-5xl w-full bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Arquitectura Cassandra Multi-Datacenter
          </h1>
          <p className="text-gray-400">
            Topología de replicación distribuida con NetworkTopologyStrategy
          </p>
        </div>

        {/* Architecture Diagram */}
        <div className="space-y-6">
          {/* Monitoring Layer - Above DC1 */}
          <div className="bg-purple-900/20 border-2 border-purple-500/50 rounded-lg p-6">
            <h2 className="text-purple-300 font-bold text-xl mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              Capa de Monitoreo
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Grafana */}
              <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-purple-200 font-semibold">Grafana</span>
                </div>
                <p className="text-gray-400 text-xs mb-2">Puerto: 3000</p>
                <p className="text-gray-300 text-xs">Dashboard de visualización de métricas del sistema</p>
              </div>

              {/* Cassandra API */}
              <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-purple-200 font-semibold">Cassandra API</span>
                </div>
                <p className="text-gray-400 text-xs mb-2">Puerto: 3001</p>
                <p className="text-gray-300 text-xs">Gateway REST para consultas a dc1</p>
              </div>
            </div>
          </div>

          {/* Datacenter 1 (Central) */}
          <div className="bg-blue-900/20 border-2 border-blue-500/50 rounded-lg p-6">
            <h2 className="text-blue-300 font-bold text-xl mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              Datacenter 1 (dc1) - Cluster Central
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Node 1 */}
              <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-blue-200 font-semibold">cassandra-1</span>
                </div>
                <p className="text-gray-400 text-xs">Rack: rack1</p>
                <p className="text-gray-400 text-xs">Tokens: 16</p>
              </div>

              {/* Node 2 */}
              <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-blue-200 font-semibold">cassandra-2</span>
                </div>
                <p className="text-gray-400 text-xs">Rack: rack2</p>
                <p className="text-gray-400 text-xs">Tokens: 16</p>
              </div>

              {/* Node 3 */}
              <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-blue-200 font-semibold">cassandra-3</span>
                </div>
                <p className="text-gray-400 text-xs">Rack: rack3</p>
                <p className="text-gray-400 text-xs">Tokens: 16</p>
              </div>
            </div>

            <div className="bg-blue-950/50 rounded p-3 text-xs text-gray-300">
              <p className="font-semibold text-blue-300 mb-1">Configuración:</p>
              <ul className="space-y-1 ml-4">
                <li>• Replication Factor: 3</li>
                <li>• NetworkTopologyStrategy</li>
                <li>• Gossip Protocol para sincronización</li>
              </ul>
            </div>
          </div>

          {/* Replication Arrow */}
          <div className="flex justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="text-gray-400 text-sm font-semibold">Replicación Multi-DC</div>
              <div className="text-green-500 text-3xl">↕</div>
              <div className="text-gray-400 text-xs">Gossip Protocol</div>
            </div>
          </div>

          {/* Datacenter 2 (Edge) - Simplified */}
          <div className="bg-green-900/20 border-2 border-green-500/50 rounded-lg p-5">
            <h2 className="text-green-300 font-bold text-lg mb-3 flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              Datacenter 2 (dc2) - Edge Node
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cassandra Agent - Compact */}
              <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-200 font-semibold text-sm">cassandra-agent</span>
                </div>
                <p className="text-gray-400 text-xs">Rack: rack1 • Tokens: 16 • Puerto: 9043</p>
              </div>

              {/* Configuration - Compact */}
              <div className="bg-green-950/50 rounded p-3 text-xs text-gray-300">
                <p className="font-semibold text-green-300 mb-1">Configuración:</p>
                <ul className="space-y-1">
                  <li>• Replication Factor: 1</li>
                  <li>• Operación autónoma durante aislamiento</li>
                  <li>• Sincronización automática al reconectar</li>
                </ul>
              </div>
            </div>

            <p className="text-gray-400 text-xs mt-3 text-center">
              Arquitectura edge completa disponible en página principal
            </p>
          </div>

          {/* Keyspace Info */}
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-5">
            <h3 className="text-yellow-300 font-semibold mb-3">
              Keyspace: pulseops
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 mb-2">Estrategia de Replicación:</p>
                <code className="text-yellow-200 bg-yellow-950/50 px-2 py-1 rounded text-xs">
                  NetworkTopologyStrategy
                </code>
              </div>
              <div>
                <p className="text-gray-400 mb-2">Configuración:</p>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• dc1: 3 réplicas</li>
                  <li>• dc2: 1 réplica</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 pt-6 border-t border-gray-700 text-center">
          <p className="text-gray-500 text-sm">
            Arquitectura diseñada para alta disponibilidad y operación autónoma en edge nodes.
            <br />
            <span className="text-gray-400">CL=LOCAL_ONE en dc2 permite escrituras sin conectividad a dc1</span>
          </p>
        </div>
      </div>
    </div>
  );
}
