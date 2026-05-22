import { editClientExecutableFile } from "@app/lib/api/files/client_executable";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  isConversationFileUseCase,
  isInteractiveContentType,
} from "@app/types/files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const EditTextRequestBodySchema = z.object({
  newText: z.string(),
  oldText: z.string().min(1, "oldText must be a non-empty string"),
});

// Mounted at /api/w/:wId/files/:fileId/edit-text.
const app = workspaceApp();

app.post("/", validate("json", EditTextRequestBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  if (!isInteractiveContentType(file.contentType)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files support inline text editing.",
      },
    });
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
  } else if (file.useCaseMetadata?.spaceId) {
    const space = await SpaceResource.fetchById(
      auth,
      file.useCaseMetadata.spaceId
    );
    if (!space || !space.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  } else {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { oldText, newText } = ctx.req.valid("json");

  const editResult = await editClientExecutableFile(auth, {
    fileId,
    oldString: oldText,
    newString: newText,
  });

  if (editResult.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: editResult.error.message,
      },
    });
  }

  return ctx.json({ success: true });
});

export default app;
