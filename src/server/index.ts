import { app } from './app';
import { getConfigPath, loadConfig, startConfigWatch } from './config/loader';
import { initScheduler } from './sse/scheduler';

const PORT = Number(process.env.LABBY_PORT ?? 8080);

async function main() {
  console.log(`Loading config from ${getConfigPath()}`);
  const state = await loadConfig();
  if (!state.ok) {
    // Invalid config is a degraded (not fatal) state by design: the dashboard
    // shows an error and hot-reload recovers once the file is fixed.
    console.warn(`Config warning: ${state.error}`);
  }
  startConfigWatch();
  initScheduler();

  console.log(`Labby listening on :${PORT}`);
  Bun.serve({
    port: PORT,
    fetch: app.fetch,
    error(err) {
      console.error('Unhandled request error:', err);
      return new Response('Internal Server Error', { status: 500 });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
