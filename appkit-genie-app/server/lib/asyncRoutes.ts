import type express from 'express';

/**
 * Express 4 doesn't catch a rejected async route handler: the rejection goes unhandled and Node stops the
 * server. A disabled Lakebase endpoint took the whole app down that way (GET /api/chat/sessions). Every
 * handler of a router passed through catchAsync hands its error to next() instead, and errorHandler answers
 * it: 503 when a data service (Lakebase, the SQL warehouse) is unavailable, 500 otherwise.
 */
export function catchAsync(router: express.Router): express.Router {
  type Layer = { route?: { stack: Array<{ handle: express.RequestHandler }> } };
  for (const layer of ((router as unknown as { stack?: Layer[] }).stack ?? [])) {
    for (const l of layer.route?.stack ?? []) {
      const fn = l.handle;
      if (fn.length > 3) continue;   // an error handler already
      l.handle = (req, res, next) => {
        try {
          const r = fn(req, res, next) as unknown;
          if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(next);
        } catch (err) {
          next(err);
        }
      };
    }
  }
  return router;
}

// Only messages that mean a service is down or unreachable (aligned with LensS v1.12.7); an ordinary SQL or
// Postgres error stays a 500.
const UNAVAILABLE = /endpoint has been disabled|endpoint .*(suspended|stopped|not running)|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|terminating connection|connection terminated|too many (clients|connections)|password authentication failed|Cannot create the resource|RESOURCE_EXHAUSTED|TEMPORARILY_UNAVAILABLE|Service Unavailable|warehouse (is )?(stopped|starting|not running|unavailable)/i;

export const errorHandler: express.ErrorRequestHandler = (err, req, res, _next) => {
  const message = err instanceof Error ? err.message : String(err);
  const unavailable = UNAVAILABLE.test(message);
  console.error(`[route] ${req.method} ${req.path} failed${unavailable ? ' (a data service is unavailable)' : ''}:`, message);
  if (res.headersSent) {   // a stream already under way (server-sent events): just close it
    try { res.end(); } catch { /* already closed */ }
    return;
  }
  res.status(unavailable ? 503 : 500).json({
    error: unavailable
      ? 'A data service LensS needs (its chat database or SQL warehouse) is unavailable right now. Please try again in a few minutes.'
      : 'Something went wrong on the server. Please try again.',
  });
};
