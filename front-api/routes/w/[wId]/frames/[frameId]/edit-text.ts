import { editFrameV2TextAtSource } from "@app/lib/api/frames/publish_from_source";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type {
  PostFrameEditTextRequestBody,
  PostFrameEditTextResponseBody,
} from "@app/types/api/frame_edit";
import { frameSourceErrorStatus } from "@front-api/lib/api/frame_source_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

const EditTextRequestBodySchema = z.object({
  conversationId: z.string(),
  newText: z.string(),
  oldText: z.string().min(1, "oldText must be a non-empty string"),
  source: z.string(),
});

// Mounted at /api/w/:wId/frames/:frameId/edit-text.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", EditTextRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { frameId } = ctx.req.valid("param");
    const body: PostFrameEditTextRequestBody = ctx.req.valid("json");

    const [frame, conversation] = await Promise.all([
      FileResource.fetchById(auth, frameId),
      ConversationResource.fetchById(auth, body.conversationId),
    ]);
    if (!frame?.isFrameV2 || !conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Frame not found." },
      });
    }

    const editResult = await editFrameV2TextAtSource(auth, {
      conversation: conversation.toJSON(),
      frame,
      source: body.source,
      oldText: body.oldText,
      newText: body.newText,
    });
    if (editResult.isErr()) {
      const status = frameSourceErrorStatus(editResult.error);
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type:
            status === 500 ? "internal_server_error" : "invalid_request_error",
          message: editResult.error.message,
        },
      });
    }

    return ctx.json<PostFrameEditTextResponseBody>({
      success: true,
      publicationId: editResult.value.publicationId,
    });
  }
);

export default app;
