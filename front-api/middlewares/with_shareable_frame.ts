import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isConversationFileUseCase } from "@app/types/files";
import type { FrameCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

/**
 * @cc [owner:flvndvd,label:security] frame-sharing-space-access
 * Pod and folder Frames require space access before reading or changing sharing settings.
 */
export const withShareableFrame = createMiddleware<FrameCtx>(
  async (ctx, next) => {
    const auth = ctx.get("auth");
    const fileId = ctx.req.param("fileId") ?? "";
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
          message: "Only Frame files can be shared.",
        },
      });
    }

    ctx.set("frame", file);
    await next();
  }
);
