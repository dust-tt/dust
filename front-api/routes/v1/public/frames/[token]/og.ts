/** @ignoreswagger */
import config from "@app/lib/api/config";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { getFrameOgImagePath } from "@app/types/api/frame_storage";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const ParamsSchema = z.object({
  token: z.string().min(1),
});

const RATE_LIMIT_MAX_PER_MINUTE = 120;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const FRAME_OG_CACHE_CONTROL = "public, max-age=86400, immutable";
const DEFAULT_FRAME_OG_PATH = "/static/og/ic.png";

// Mounted at /api/v1/public/frames/:token/og.
const app = unauthedApp();

function redirectToDefaultOg(ctx: Context) {
  return ctx.redirect(`${config.getAppUrl()}${DEFAULT_FRAME_OG_PATH}`, 302);
}

/**
 * GET /api/v1/public/frames/:token/og
 *
 * World-readable endpoint for a Frame's Open Graph preview image. No
 * authentication required — Slack/mobile crawlers fetch this URL from og:image
 * meta tags. The share token is the capability; revoked/missing shares 404.
 *
 * Caching model mirrors workspace branding: Cache-Control immutable + ?v=
 * generation cache-buster. Bytes are returned directly (no signed-URL redirect).
 */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const { token } = ctx.req.valid("param");

  const clientIp = ctx.req.header("x-forwarded-for") ?? "unknown";
  const remaining = await rateLimiter({
    key: `frame-og:ip:${clientIp}`,
    maxPerTimeframe: RATE_LIMIT_MAX_PER_MINUTE,
    timeframeSeconds: RATE_LIMIT_WINDOW_SECONDS,
    logger,
  });
  if (remaining < 0) {
    return apiError(ctx, {
      status_code: 429,
      api_error: { type: "rate_limit_error", message: "Too many requests." },
    });
  }

  const result = await FileResource.fetchByShareToken(token);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "Not found." },
    });
  }

  const { file } = result.value;
  if (!file.isShareableFrame) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "Not found." },
    });
  }

  const workspace = await WorkspaceResource.fetchByModelId(file.workspaceId);
  if (!workspace) {
    return redirectToDefaultOg(ctx);
  }

  const bucket = getPrivateUploadBucket();
  const storagePath = getFrameOgImagePath({
    workspaceId: workspace.sId,
    frameId: file.sId,
  });
  const contentTypeResult = await bucket.getFileContentType(storagePath);
  if (contentTypeResult.isErr()) {
    return redirectToDefaultOg(ctx);
  }

  const content = await bucket.fetchFileBuffer(storagePath);
  const contentType = contentTypeResult.value ?? "image/png";

  return ctx.body(content, 200, {
    "Content-Type": contentType,
    "Cache-Control": FRAME_OG_CACHE_CONTROL,
    "X-Robots-Tag": "noindex",
  });
});

export default app;
