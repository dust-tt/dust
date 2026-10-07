import { createHash, timingSafeEqual } from "node:crypto";
import type { LiveFile } from "@app/lib/api/collab/live_file";
import { checkLiveAccess } from "@app/lib/api/collab/live_file";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type {
  LiveSourceReadResponse,
  LiveSourceWriteResponse,
} from "@app/types/collab";
import {
  INTERNAL_LIVE_SOURCE_READ_PATH,
  INTERNAL_LIVE_SOURCE_WRITE_PATH,
  liveSourceReadRequestSchema,
  liveSourceWriteRequestSchema,
  toLiveDocumentName,
} from "@app/types/collab";
import {
  readLiveSource,
  writeLiveSource,
} from "@front-api/lib/collab/hocuspocus";
import { createHono } from "@front-api/lib/hono";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Hocuspocus } from "@hocuspocus/server";

const BEARER_PREFIX = "Bearer ";

// Hashed first so the comparison takes the same time whatever the length of what was sent.
const digest = (value: string) => createHash("sha256").update(value).digest();

function isAuthorized(authorization: string | undefined): boolean {
  const secret = config.getCollabServerInternalSecret();
  if (!secret || !authorization?.startsWith(BEARER_PREFIX)) {
    return false;
  }
  return timingSafeEqual(
    digest(authorization.slice(BEARER_PREFIX.length)),
    digest(secret)
  );
}

/**
 * @cc [owner:tdraier,label:security] collab-internal-routes
 * Every internal route MUST answer 401 unless the request carries the configured internal secret,
 * and MUST answer 401 to every request when none is configured. A write MUST be applied only for
 * the file `checkLiveAccess` opens for the request's user, workspace and path, and MUST answer 403
 * when it refuses.
 */
export function createInternalDocumentsApp(hocuspocus: Hocuspocus<LiveFile>) {
  const app = createHono();

  // Only its own routes: the app is mounted at the root, next to the public ones.
  app.use("/internal/*", async (ctx, next) => {
    if (!isAuthorized(ctx.req.header("authorization"))) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "The internal secret is missing or invalid.",
        },
      });
    }
    await next();
  });

  app.post(
    INTERNAL_LIVE_SOURCE_READ_PATH,
    validate("json", liveSourceReadRequestSchema),
    async (ctx) => {
      const { workspaceId, canonicalPath } = ctx.req.valid("json");

      const read = await readLiveSource(
        hocuspocus,
        toLiveDocumentName(workspaceId, canonicalPath)
      );
      if (read.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: { type: "internal_server_error", message: read.error },
        });
      }
      return ctx.json<LiveSourceReadResponse>(read.value);
    }
  );

  app.post(
    INTERNAL_LIVE_SOURCE_WRITE_PATH,
    validate("json", liveSourceWriteRequestSchema),
    async (ctx) => {
      const { workspaceId, userId, canonicalPath, base, source } =
        ctx.req.valid("json");

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        userId,
        workspaceId
      );
      const file = await checkLiveAccess(auth, canonicalPath);
      if (file.isErr()) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: file.error.message,
          },
        });
      }

      const written = await writeLiveSource(hocuspocus, {
        documentName: toLiveDocumentName(workspaceId, canonicalPath),
        file: file.value,
        base,
        source,
      });
      return ctx.json<LiveSourceWriteResponse>(
        written.isOk()
          ? { result: written.value }
          : { result: "refused", message: written.error }
      );
    }
  );

  return app;
}
