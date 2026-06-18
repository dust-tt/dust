import config from "@app/lib/api/config";
import type { GetShareFrameMetadataResponseBody } from "@app/lib/api/files/share";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { lookupShareToken } from "@app/lib/api/regions/lookup";
import { getWorkspaceBrandingPublicUrls } from "@app/lib/api/workspace_branding";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { isInteractiveContentType } from "@app/types/files";
import { createHono } from "@front-api/lib/hono";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  token: z.string(),
});

const app = createHono();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetShareFrameMetadataResponseBody> => {
    const { token } = ctx.req.valid("param");

    const result = await FileResource.fetchByShareToken(token);
    if (result.isErr()) {
      if (result.error.code === "file_not_found") {
        // Not found locally — check other region.
        const lookupResult = await lookupShareToken(token);
        if (lookupResult.isErr()) {
          logger.error(
            { err: lookupResult.error },
            "Failed to lookup share token in other region"
          );
        }
        if (lookupResult.isOk() && lookupResult.value) {
          const region = lookupResult.value;
          return ctx.json(
            {
              error: {
                type: "workspace_in_different_region",
                message: "File is located in a different region",
                redirect: {
                  region,
                  url: regionConfig.getRegionUrl(region),
                },
              },
            },
            400
          );
        }
      }

      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }

    const { file, shareScope } = result.value;

    // Only allow Frame files.
    if (!isInteractiveContentType(file.contentType)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Only Frame files can be shared.",
        },
      });
    }

    const workspace = await WorkspaceResource.fetchByModelId(file.workspaceId);
    if (!workspace) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }

    // If file is shared publicly, ensure workspace allows it.
    if (
      shareScope === "public" &&
      !workspace.canShareInteractiveContentPublicly
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }

    const shareUrl = `${config.getAppUrl()}/share/frame/${token}`;

    // Only show the email verification form if the scope supports email
    // invites AND there are active grants.
    const isEmailScope =
      shareScope === "emails_only" || shareScope === "workspace_and_emails";
    const hasActiveGrants = isEmailScope
      ? (await file.listActiveSharingGrants()).length > 0
      : false;
    const requiresEmailVerification = isEmailScope && hasActiveGrants;

    const { faviconUrl, logoUrl, ogImageUrl } =
      await getWorkspaceBrandingPublicUrls(workspace);

    const description =
      ogImageUrl === null
        ? `Discover what ${workspace.name} built with AI. Explore now.`
        : null;

    return ctx.json({
      description,
      faviconUrl,
      logoUrl,
      ogImageUrl,
      requiresEmailVerification,
      shareUrl,
      title: file.fileName,
      vizUrl: config.getVizPublicUrl(),
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
    });
  }
);

export default app;
