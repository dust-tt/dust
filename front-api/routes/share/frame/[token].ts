import { lookupShareTokenInOtherCells } from "@app/lib/api/cells/lookup";
import config from "@app/lib/api/config";
import { getWorkspaceBrandingPublicUrls } from "@app/lib/api/workspace_branding";
import { formatFilenameForDisplay } from "@app/lib/files";
import { FileResource } from "@app/lib/resources/file_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type { GetShareFrameMetadataResponseBody } from "@app/types/api/files/share";
import { createHono } from "@front-api/lib/hono";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { resolveOptionalAuth } from "@front-api/routes/v1/public/frames/shared_auth";
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
        // Not found locally — check other cells.
        const lookupResult = await lookupShareTokenInOtherCells(token);
        if (lookupResult.isErr()) {
          logger.error(
            { err: lookupResult.error },
            "Failed to lookup share token in other region"
          );
        }
        if (lookupResult.isOk() && lookupResult.value) {
          return ctx.json(
            {
              error: {
                type: "workspace_in_different_cell",
                message: "File is located in a different cell",
                redirect: lookupResult.value,
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
    if (!file.isShareableFrame) {
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

    const [hasActiveFrameFunctions, auth] = await Promise.all([
      file.hasActiveFrameFunctions(),
      resolveOptionalAuth(ctx, workspace.sId),
    ]);

    // A Frame whose active publication declares functions is unusable without a workspace
    // session, so it must look unshared to everyone else.
    if (hasActiveFrameFunctions && !auth) {
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
      ? (await SharingGrantResource.listForFile(file)).length > 0
      : false;
    const requiresEmailVerification = isEmailScope && hasActiveGrants;

    const { faviconUrl, logoUrl, ogImageUrl } =
      await getWorkspaceBrandingPublicUrls(workspace);

    // For workspaces without custom branding, add viral copy to drive sign-ups.
    const isBrandedWorkspace = ogImageUrl !== null;
    const description = isBrandedWorkspace
      ? null
      : `Discover what ${workspace.name} built with AI. Explore now.`;

    return ctx.json({
      description,
      faviconUrl,
      logoUrl,
      ogImageUrl,
      requiresEmailVerification,
      shareUrl,
      showSignUpCta: !isBrandedWorkspace,
      // A Frame v2's file is its manifest, so its display name comes from the active
      // publication rather than the file name.
      title:
        file.useCaseMetadata?.frameName ??
        formatFilenameForDisplay(file.fileName),
      vizUrl: config.getVizPublicUrl(),
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
    });
  }
);

export default app;
