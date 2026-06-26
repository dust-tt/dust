/** @ignoreswagger */
import config from "@app/lib/api/config";
import {
  BRANDING_DEFAULT_ASSET_PATHS,
  type BrandingAssetName,
  buildBrandingAssetStoragePath,
  isBrandingAssetName,
} from "@app/lib/api/workspace_branding";
import { getFeatureFlagsForWorkspace } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const ParamsSchema = z.object({
  wId: z.string().min(1),
  asset: z.string().min(1),
});

const RATE_LIMIT_MAX_PER_MINUTE = 120;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const BRANDING_CACHE_CONTROL = "public, max-age=86400, immutable";

// Mounted at /api/v1/public/branding.
const app = unauthedApp();

function redirectToDefaultAsset(ctx: Context, asset: BrandingAssetName) {
  const defaultUrl = `${config.getAppUrl()}${BRANDING_DEFAULT_ASSET_PATHS[asset]}`;

  return ctx.redirect(defaultUrl, 302);
}

/**
 * GET /api/v1/public/branding/:wId/:asset
 *
 * World-readable endpoint for workspace branding assets. No authentication required.
 * Fetches and returns asset bytes in a 200 response: custom asset from private storage
 * when the workspace is entitled and has one uploaded, Dust default asset otherwise.
 *
 * Caching model: Cache-Control: public, max-age=86400, immutable. Safe because ?v= is
 * a content-addressed cache-buster. The same URL always returns the same bytes.
 *
 * History note (do not reintroduce signed URL redirects): the previous design returned a
 * 302 to a short-lived signed URL, with Cache-Control on the redirect itself. Once the
 * browser cached the 302, it would serve the cached redirect after the signed URL had
 * expired (5 min), producing 403s from the storage backend. The ?v= immutability and
 * the signed URL expiry were solving the same problem twice. Signed URLs added latency
 * and a failure mode with no benefit.
 */
app.get("/:wId/:asset", validate("param", ParamsSchema), async (ctx) => {
  const { wId, asset } = ctx.req.valid("param");

  if (!isBrandingAssetName(asset)) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "Not found." },
    });
  }

  const clientIp = ctx.req.header("x-forwarded-for") ?? "unknown";
  const remaining = await rateLimiter({
    key: `branding:ip:${clientIp}`,
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

  const workspace = await WorkspaceResource.fetchById(wId);
  if (!workspace) {
    return redirectToDefaultAsset(ctx, asset);
  }

  const featureFlags = await getFeatureFlagsForWorkspace(
    renderLightWorkspaceType({ workspace })
  );
  if (!featureFlags.includes("whitelabel_frames")) {
    return redirectToDefaultAsset(ctx, asset);
  }

  const bucket = getPrivateUploadBucket();
  const storagePath = buildBrandingAssetStoragePath({ wId, asset });
  const contentTypeResult = await bucket.getFileContentType(storagePath);
  if (contentTypeResult.isErr()) {
    return redirectToDefaultAsset(ctx, asset);
  }

  const content = await bucket.fetchFileBuffer(storagePath);
  const contentType = contentTypeResult.value ?? "application/octet-stream";

  return ctx.body(content, 200, {
    "Content-Type": contentType,
    "Cache-Control": BRANDING_CACHE_CONTROL,
    "X-Robots-Tag": "noindex",
  });
});

export default app;
