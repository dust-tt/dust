import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { BrandingAssetState } from "@app/lib/api/workspace_branding";
import {
  deleteBrandingAsset,
  generateAndStoreOgImage,
  getBrandingAssetState,
  promoteBrandingAsset,
  USER_UPLOADABLE_BRANDING_ASSET_NAMES,
} from "@app/lib/api/workspace_branding";
import { FileResource } from "@app/lib/resources/file_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { z } from "zod";

const BrandingPromoteBodySchema = z.object({
  asset: z.enum(USER_UPLOADABLE_BRANDING_ASSET_NAMES),
  fileId: z.string().nullable(),
});

interface GetWorkspaceBrandingResponseBody {
  branding: {
    assets: {
      logo: BrandingAssetState;
      favicon: BrandingAssetState;
      og: BrandingAssetState;
    };
  };
}

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceBrandingResponseBody> => {
    const wId = ctx.get("auth").getNonNullableWorkspace().sId;

    const [logoResult, faviconResult, ogResult] = await Promise.all([
      getBrandingAssetState({ wId }, "logo"),
      getBrandingAssetState({ wId }, "favicon"),
      getBrandingAssetState({ wId }, "og"),
    ]);

    if (logoResult.isErr() || faviconResult.isErr() || ogResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to fetch branding assets.",
        },
      });
    }

    return ctx.json({
      branding: {
        assets: {
          logo: logoResult.value,
          favicon: faviconResult.value,
          og: ogResult.value,
        },
      },
    });
  }
);

/** @ignoreswagger */
app.patch(
  "/",
  ensureIsAdmin(),
  withFeatureFlag("whitelabel_frames", {
    message: "Whitelabel frames are not enabled for this workspace.",
  }),
  validate("json", BrandingPromoteBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { asset, fileId } = ctx.req.valid("json");

    if (fileId === null) {
      const result = await deleteBrandingAsset(auth, asset);
      if (result.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete branding asset.",
          },
        });
      }

      // When the logo is removed, the OG card is no longer relevant.
      if (asset === "logo") {
        await deleteBrandingAsset(auth, "og");
      }

      void emitAuditLogEvent({
        auth,
        action: "workspace_branding.asset_deleted",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        ],
        context: getAuditLogContext(auth),
        metadata: { asset },
      });

      return ctx.body(null, 204);
    }

    const file = await FileResource.fetchById(auth, fileId);
    if (!file) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    if (
      file.useCase !== "workspace_branding" ||
      file.useCaseMetadata?.asset !== asset
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "File does not match the requested branding asset.",
        },
      });
    }

    const result = await promoteBrandingAsset(auth, file, asset);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to promote branding asset.",
        },
      });
    }

    // Regenerate the OG card whenever the logo is updated.
    if (asset === "logo") {
      await generateAndStoreOgImage(auth);
    }

    void emitAuditLogEvent({
      auth,
      action: "workspace_branding.asset_promoted",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      ],
      context: getAuditLogContext(auth),
      metadata: { asset },
    });

    return ctx.body(null, 204);
  }
);

export default app;
