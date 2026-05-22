import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isConversationFileUseCase } from "@app/types/files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/files/:fileId/metadata.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { useCase, useCaseMetadata } = fileResource;
  const space = useCaseMetadata?.spaceId
    ? await SpaceResource.fetchById(auth, useCaseMetadata.spaceId)
    : null;

  if (useCase === "folders_document" && (!space || !space.canRead(auth))) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  // Check permissions based on useCase and useCaseMetadata.
  if (isConversationFileUseCase(useCase) && useCaseMetadata?.conversationId) {
    const conversation = await ConversationResource.fetchById(
      auth,
      useCaseMetadata.conversationId
    );

    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  }

  return ctx.json(fileResource.toJSONWithMetadata(auth));
});

export default app;
