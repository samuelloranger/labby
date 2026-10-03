import { app } from './app';
import { readAuthConfig, withAuth } from './auth';
import { loadConfig } from './config/loader';
import { migrateLayoutToIntegrations } from './config/migrate-layout';
import { initScheduler } from './sse/scheduler';

const PORT = Number(process.env.LABBY_PORT ?? 8080);

async function main() {
  let auth: ReturnType<typeof readAuthConfig>;
  try {
    auth = readAuthConfig(process.env);
  } catch (err) {
    console.error(`OIDC config error: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(auth ? `OIDC login enabled (issuer ${auth.issuer})` : 'OIDC login disabled');

  console.log('Loading config from SQLite database');

  migrateLayoutToIntegrations();
  const state = await loadConfig();
  if (!state.ok) {
    // Invalid config is a degraded (not fatal) state by design: the dashboard
    // shows an error and hot-reload recovers once the file is fixed.
    console.warn(`Config warning: ${state.error}`);
  }
  initScheduler();

  const server = withAuth(app, auth);

  console.log(`Labby listening on :${PORT}`);
  Bun.serve({
    port: PORT,
    fetch: server.fetch,
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
