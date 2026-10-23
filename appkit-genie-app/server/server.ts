import { createApp, genie, server, lakebase } from '@databricks/appkit';
import { buildChatRouter } from './routes/chat.js';
import { buildDashboardRouter } from './routes/dashboard.js';
import { buildExplorerRouter } from './routes/explorer.js';
import { buildEvalsRouter } from './routes/evals.js';
import { buildCostRouter } from './routes/cost.js';
import { startIdleStop, trackUse } from './lib/idleStop.js';
import { catchAsync, errorHandler } from './lib/asyncRoutes.js';

// A failure in background work (warm-up, pre-warm, judging) is logged, never allowed to stop the server.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection (kept running):', reason instanceof Error ? reason.message : reason);
});

createApp({
  plugins: [
    genie(),
    lakebase(),
    server({ staticPath: 'public' }),
  ],
  onPluginsReady(appkit) {
    startIdleStop();
    appkit.server.extend((app) => {
      app.use(trackUse);   // first, so every request from a signed-in caller counts as use
      // Express 4 doesn't catch rejected async handlers (catchAsync): errors reach errorHandler, not the process.
      app.use(catchAsync(buildChatRouter(appkit)));
      app.use(catchAsync(buildDashboardRouter(appkit.lakebase)));
      app.use(catchAsync(buildExplorerRouter(appkit.lakebase)));
      app.use(catchAsync(buildEvalsRouter(appkit)));
      app.use(catchAsync(buildCostRouter()));
      app.use(errorHandler);
    });
  },
}).catch(console.error);
