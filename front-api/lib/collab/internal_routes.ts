import { createHash, timingSafeEqual } from "node:crypto";
import type { LiveFile } from "@app/lib/api/collab/live_file";
import { checkLiveAccess } from "@app/lib/api/collab/live_file";
import config from "@app/lib/api/config";
import { WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES } from "@app/lib/api/files/file_system_ops";
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
import type { Context } from "hono";

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

async function openLiveFileForUser({
  workspaceId,
  userId,
  canonicalPath,
}: {
  workspaceId: string;
  userId: string;
  canonicalPath: string;
}) {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspaceId
  );
  return checkLiveAccess(auth, canonicalPath);
}

function accessRefused(ctx: Context, message: string) {
  return apiError(ctx, {
    status_code: 403,
    api_error: { type: "workspace_auth_error", message },
  });
}

/**
 * @cc [owner:tdraier,label:security] collab-internal-routes
 * Every internal route MUST answer 401 unless the request carries the configured internal secret,
 * and MUST answer 401 to every request when none is configured. A read MUST return a document's
 * source, and a write MUST be applied, only for the file `checkLiveAccess` opens for the request's
 * user, workspace and path, answering 403 when it refuses or, for an open document, when the
 * request has no user. A write whose source is larger than `WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES`
 * MUST be refused before it reaches the session, since no checkpoint could write it.
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
      const { workspaceId, userId, canonicalPath } = ctx.req.valid("json");

      const read = await readLiveSource(
        hocuspocus,
        toLiveDocumentName(workspaceId, canonicalPath)
      );
      if (read.isErr()) {
        // TODO(co-edition): answer a distinct outcome telling the agent a person's edit cannot be
        // saved yet, rather than an error.
        return apiError(
          ctx,
          {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "The live document could not be read.",
            },
          },
          new Error(read.error)
        );
      }
      if (!read.value.open) {
        return ctx.json<LiveSourceReadResponse>(read.value);
      }

      if (!userId) {
        return accessRefused(
          ctx,
          "This document is being edited live and can only be read on behalf of a user."
        );
      }
      const file = await openLiveFileForUser({
        workspaceId,
        userId,
        canonicalPath,
      });
      if (file.isErr()) {
        return accessRefused(ctx, file.error.message);
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

      const file = await openLiveFileForUser({
        workspaceId,
        userId,
        canonicalPath,
      });
      if (file.isErr()) {
        return accessRefused(ctx, file.error.message);
      }
      if (
        Buffer.byteLength(source, "utf8") >
        WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES
      ) {
        return ctx.json<LiveSourceWriteResponse>({
          result: "refused",
          message: "This document would be too large to edit live.",
        });
      }

      const written = await writeLiveSource(hocuspocus, {
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
