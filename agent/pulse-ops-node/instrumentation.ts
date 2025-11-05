/**
 * OpenTelemetry Instrumentation for Next.js
 * Este archivo se ejecuta automáticamente al iniciar Next.js (dev/build/start)
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Solo ejecutar en el servidor Node.js (no en edge runtime ni browser)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOTel } = await import('./lib/otel')
    await registerOTel()
  }
}
