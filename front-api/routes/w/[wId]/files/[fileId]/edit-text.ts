import { editClientExecutableFile } from "@app/lib/api/files/client_executable";
import { editFrameV2TextsAtSource } from "@app/lib/api/frames/publish_from_source";
import { editFrameTextsAtSource } from "@app/lib/api/viz/edit_frame_text";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  isConversationFileUseCase,
  isInteractiveContentType,
} from "@app/types/files";
import { frameSourceErrorStatus } from "@front-api/lib/api/frame_source_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const EditItemSchema = z.object({
  newText: z.string(),
  oldText: z.string().min(1, "oldText must be a non-empty string"),
  // When set ("<relPath>:<line>:<col>"), edit the Frame's source by location.
  source: z.string().optional(),
  targetFileId: z.string().optional(),
});

/**
 * Additive batch support: callers may send either a single edit (legacy fields) or `edits[]`.
 * Both remain valid; `edits` is preferred when flushing multiple staged live edits so the
 * server can apply them and publish once.
 */
const EditTextRequestBodySchema = z
  .object({
    conversationId: z.string().optional(),
    newText: z.string().optional(),
    oldText: z.string().min(1, "oldText must be a non-empty string").optional(),
    source: z.string().optional(),
    edits: z.array(EditItemSchema).min(1).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.edits && body.edits.length > 0) {
      return;
    }
    if (body.oldText === undefined || body.newText === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either edits[] or oldText/newText.",
      });
    }
  });

const ParamsSchema = z.object({
  fileId: z.string(),
});

// Mounted at /api/w/:wId/files/:fileId/edit-text.
const app = workspaceApp();

function normalizeEdits(
  body: z.infer<typeof EditTextRequestBodySchema>
): Array<z.infer<typeof EditItemSchema>> {
  if (body.edits && body.edits.length > 0) {
    return body.edits;
  }
  return [
    {
      oldText: body.oldText!,
      newText: body.newText!,
      source: body.source,
    },
  ];
}

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", EditTextRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { fileId } = ctx.req.valid("param");
    const body = ctx.req.valid("json");
    const { conversationId } = body;
    const edits = normalizeEdits(body);

    const file = await FileResource.fetchById(auth, fileId);
    if (!file) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    if (file.isFrameV2) {
      const missingSource = edits.find((edit) => !edit.source);
      if (!conversationId || missingSource) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Frame v2 editing requires a conversation and source location.",
          },
        });
      }

      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversation) {
        return apiError(ctx, {
          status_code: 404,
          api_error: { type: "file_not_found", message: "File not found." },
        });
      }

      const editResult = await editFrameV2TextsAtSource(auth, {
        conversation: conversation.toJSON(),
        frame: file,
        edits: edits.map((edit) => ({
          source: edit.source!,
          oldText: edit.oldText,
          newText: edit.newText,
        })),
      });
      if (editResult.isErr()) {
        const status = frameSourceErrorStatus(editResult.error);
        return apiError(ctx, {
          status_code: status,
          api_error: {
            type:
              status === 500
                ? "internal_server_error"
                : "invalid_request_error",
            message: editResult.error.message,
          },
        });
      }

      return ctx.json({ success: true });
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

    // Batch `edits[]` is Frames v2 only. Legacy Frames keep one-edit-per-request publish-on-blur.
    if (body.edits && body.edits.length > 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Batch text edits are only supported for Frames v2.",
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
      if (!space || !auth.can("write", space)) {
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

    // Batch rejected above: remaining legacy/published-v1 path is one edit per request.
    const [edit] = edits;
    if (edit.source) {
      const editResult = await editFrameTextsAtSource(auth, {
        file,
        edits: [
          {
            source: edit.source,
            oldText: edit.oldText,
            newText: edit.newText,
          },
        ],
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
    }

    const editResult = await editClientExecutableFile(auth, {
      fileId: edit.targetFileId ?? fileId,
      oldString: edit.oldText,
      newString: edit.newText,
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
  }
);

export default app;
