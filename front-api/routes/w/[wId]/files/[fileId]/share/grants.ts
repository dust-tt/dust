import type { FrameSharingState } from "@app/lib/api/share/frame_sharing";
import {
  addFrameSharingGrants,
  listFrameSharing,
} from "@app/lib/api/share/frame_sharing";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SharingGrantsResponse } from "@app/types/sharing_grants";
import { addSharingGrantsSchema } from "@app/types/sharing_grants";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withShareableFrame } from "@front-api/middlewares/with_shareable_frame";
import { z } from "zod";

const RevokeGrantRequestBodySchema = z.object({
  grantId: z.union([z.string(), z.number()]),
});

const ParamsSchema = z.object({
  fileId: z.string(),
});

// Mounted at /api/w/:wId/files/:fileId/share/grants.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  withShareableFrame,
  async (ctx) => {
    const auth = ctx.get("auth");
    const file = ctx.get("frame");

    const sharing = await listFrameSharing(auth, file);
    return ctx.json(serializeFrameSharing(sharing));
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", addSharingGrantsSchema),
  withShareableFrame,
  async (ctx) => {
    const auth = ctx.get("auth");
    const file = ctx.get("frame");

    const result = await addFrameSharingGrants(
      auth,
      file,
      ctx.req.valid("json")
    );
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: result.error.code === "unauthorized" ? 403 : 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json(serializeFrameSharing(result.value));
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  validate("json", RevokeGrantRequestBodySchema),
  withShareableFrame,
  async (ctx) => {
    const auth = ctx.get("auth");
    const file = ctx.get("frame");

    const { grantId } = ctx.req.valid("json");
    if (typeof grantId === "string") {
      const grant = await SharingGrantResource.fetchById(file, grantId);
      if (!grant) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "Sharing grant not found",
          },
        });
      }
      const result = await grant.revoke(auth);
      if (result.isErr()) {
        return apiError(ctx, {
          status_code: 404,
          api_error: { type: "file_not_found", message: result.error.message },
        });
      }
      return ctx.body(null, 204);
    }

    const result = await file.revokeSharingGrant(auth, { grantId });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: result.error.message,
        },
      });
    }

    return ctx.body(null, 204);
  }
);

function serializeFrameSharing({
  grants,
  viewers,
  blockedGrantIds,
  membersOnly,
  canGrantDomains,
}: FrameSharingState): SharingGrantsResponse {
  return {
    grants: removeNulls(
      grants.map((grant) =>
        grant.toLegacyJSON({
          blockedByPolicy: membersOnly
            ? blockedGrantIds.has(grant.sId)
            : undefined,
        })
      )
    ),
    accessGrants: grants.map((grant) =>
      grant.toJSON({
        blockedByPolicy: blockedGrantIds.has(grant.sId),
      })
    ),
    viewers: viewers.map((viewer) => ({
      email: viewer.email,
      firstViewedAt: viewer.firstViewedAt.getTime(),
      lastViewedAt: viewer.lastViewedAt.getTime(),
      viewedDays: viewer.viewedDays,
    })),
    canGrantDomains,
  };
}

export default app;
