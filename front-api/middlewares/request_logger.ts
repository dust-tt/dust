import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getClientIp } from "@app/lib/utils/request";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { createMiddleware } from "hono/factory";

type RequestLoggerEnv = {
  Variables: {
    auth?: Authenticator;
    session?: SessionWithUser;
  };
};

export const requestLogger = createMiddleware<RequestLoggerEnv>(
  async (c, next) => {
    const startMs = performance.now();
    await next();
    const durationMs = Math.round(performance.now() - startMs);

    const statusCode = c.res.status;
    const route = c.req.routePath ?? c.req.path;

    const headers: Record<string, string | string[] | undefined> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const clientIp = getClientIp({ headers });

    const auth = c.get("auth");
    const session = c.get("session");

    const tags = [`method:${c.req.method}`, `status_code:${statusCode}`];
    getStatsDClient().increment("requests.count", 1, tags);
    getStatsDClient().distribution(
      "requests.duration.distribution",
      durationMs,
      tags
    );

    logger.info(
      {
        clientIp,
        durationMs,
        method: c.req.method,
        route,
        sessionId: session?.sessionId ?? "unknown",
        statusCode,
        url: c.req.url,
        userId: auth?.user()?.sId,
        workspaceId: auth?.workspace()?.sId,
      },
      "Processed request"
    );
  }
);
