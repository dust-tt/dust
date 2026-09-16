import type { FrameSharingState } from "@app/lib/api/share/frame_sharing";
import {
  addFrameSharingGrants,
  listFrameSharing,
} from "@app/lib/api/share/frame_sharing";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isConversationFileUseCase } from "@app/types/files";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import type { SharingGrantsResponse } from "@app/types/sharing_grants";
import { addSharingGrantsSchema } from "@app/types/sharing_grants";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
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
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { fileId } = ctx.req.valid("param");

  const file = await fetchShareableFile(ctx, auth, fileId);
  if (file instanceof Response) {
    return file;
  }

  const sharing = await listFrameSharing(auth, file);
  return ctx.json(serializeFrameSharing(sharing));
});

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", addSharingGrantsSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { fileId } = ctx.req.valid("param");

    const file = await fetchShareableFile(ctx, auth, fileId);
    if (file instanceof Response) {
      return file;
    }

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
  async (ctx) => {
    const auth = ctx.get("auth");
    const { fileId } = ctx.req.valid("param");

    const file = await fetchShareableFile(ctx, auth, fileId);
    if (file instanceof Response) {
      return file;
    }

    const { grantId } = ctx.req.valid("json");
    if (isString(grantId)) {
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

/**
 * @cc [owner:flvndvd,label:security] frame-sharing-space-access
 * Pod and folder Frames require read access to their space before listing viewers or changing grants.
 */
async function fetchShareableFile(
  ctx: Context,
  auth: Authenticator,
  fileId: string
): Promise<FileResource | Response> {
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  if (
    file.useCase === "project_context" ||
    file.useCase === "folders_document"
  ) {
    const space = file.useCaseMetadata?.spaceId
      ? await SpaceResource.fetchById(auth, file.useCaseMetadata.spaceId)
      : null;
    if (!space || !auth.can("read", space)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  }

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  }

  if (!file.isShareableFrame) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files support sharing grants.",
      },
    });
  }

  if (file.isFrameV2) {
    await file.ensureShareableFrame(auth);
  }

  return file;
}

export default app;
