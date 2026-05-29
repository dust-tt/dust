import { addFileToProject } from "@app/lib/api/projects/context";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { FileTypeWithMetadata } from "@app/types/files";
import { isConversationFileUseCase } from "@app/types/files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type SaveInProjectResponseBody = {
  file: FileTypeWithMetadata;
};

const SaveInProjectRequestBodySchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
});

// Mounted at /api/w/:wId/files/:fileId/save-in-project.
const app = workspaceApp();

app.post(
  "/",
  validate("json", SaveInProjectRequestBodySchema),
  async (ctx): HandlerResult<SaveInProjectResponseBody> => {
    const auth = ctx.get("auth");
    const fileId = ctx.req.param("fileId") ?? "";

    const file = await FileResource.fetchById(auth, fileId);
    if (!file) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    // Only allow moving frame files.
    if (!file.isInteractiveContent) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Only Frame files can be saved to a pod.",
        },
      });
    }

    // Only allow moving files that are currently in a conversation
    // (tool_output or conversation use case).
    if (!isConversationFileUseCase(file.useCase)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Only conversation frame files can be saved to a pod. This file is already in a pod or has another use case.",
        },
      });
    }

    // Verify user has access to the conversation that owns this file.
    if (file.useCaseMetadata?.conversationId) {
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

    const { projectId } = ctx.req.valid("json");

    const space = await SpaceResource.fetchById(auth, projectId);
    if (!space) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "space_not_found", message: "Project not found." },
      });
    }

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The given space is not a project.",
        },
      });
    }

    if (!space.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have write access to this project.",
        },
      });
    }

    const result = await addFileToProject(auth, {
      file,
      space,
      sourceConversationId: file.useCaseMetadata?.conversationId,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ file: file.toJSONWithMetadata(auth) });
  }
);

export default app;
