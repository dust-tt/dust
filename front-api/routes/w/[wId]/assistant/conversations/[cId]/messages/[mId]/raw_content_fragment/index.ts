import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { fileAttachmentLocation } from "@app/lib/resources/content_fragment_resource";
import { isContentFragmentType } from "@app/types/content_fragment";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type { HttpBindings } from "@hono/node-server";
import { IncomingForm } from "formidable";
import { Hono } from "hono";

const privateUploadGcs = getPrivateUploadBucket();

const VALID_FORMATS = ["raw", "text"] as const;
type ContentFormat = (typeof VALID_FORMATS)[number];

function isValidContentFormat(
  format: string | undefined
): format is ContentFormat {
  return (
    typeof format === "string" &&
    VALID_FORMATS.includes(format as ContentFormat)
  );
}

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/raw_content_fragment.
//
// POST consumes multipart via formidable on the raw Node `IncomingMessage`
// exposed by `@hono/node-server` (`ctx.env.incoming`) — matching the Next
// handler.
const app = new Hono<WorkspaceAwareCtx & { Bindings: HttpBindings }>();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();
  const conversationId = ctx.req.param("cId") ?? "";
  const messageId = ctx.req.param("mId") ?? "";

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const conversation = conversationRes.value;
  const message = conversation.content.flat().find((m) => m.sId === messageId);
  if (!message || !isContentFragmentType(message)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Uploading raw content fragment is only supported for 'content fragment' messages.",
      },
    });
  }

  const formatParam = ctx.req.query("format");
  const contentFormat = isValidContentFormat(formatParam) ? formatParam : "raw";

  const { filePath } = fileAttachmentLocation({
    workspaceId: owner.sId,
    conversationId,
    messageId,
    // Legacy endpoint, we only support download.
    contentFormat,
  });

  const url = await privateUploadGcs.getSignedUrl(filePath, {
    // Since we redirect, the use is immediate so expiry can be short.
    expirationDelayMs: 10 * 1000,
    promptSaveAs:
      message.title.replace(/[^\w\s.-]/gi, "") +
      (contentFormat === "text" ? ".txt" : ""),
  });

  return ctx.redirect(url);
});

// TODO(2024-07-02 flav) Remove this endpoint.
app.post("/", async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();
  const conversationId = ctx.req.param("cId") ?? "";
  const messageId = ctx.req.param("mId") ?? "";

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const conversation = conversationRes.value;
  const message = conversation.content.flat().find((m) => m.sId === messageId);
  if (!message || !isContentFragmentType(message)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Uploading raw content fragment is only supported for 'content fragment' messages.",
      },
    });
  }

  const { filePath, downloadUrl } = fileAttachmentLocation({
    workspaceId: owner.sId,
    conversationId,
    messageId,
    contentFormat: "raw",
  });

  const incoming = ctx.env?.incoming;
  if (!incoming) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Multipart upload is not supported in this runtime.",
      },
    });
  }

  try {
    const form = new IncomingForm();
    const [, files] = await form.parse(incoming);

    const maybeFiles = files.file;

    if (!maybeFiles) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "No file uploaded",
        },
      });
    }

    const [file] = maybeFiles;

    await privateUploadGcs.uploadFileToBucket(file, filePath);

    return ctx.json({ sourceUrl: downloadUrl });
  } catch (error) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Error uploading file.",
        },
      },
      normalizeError(error)
    );
  }
});

export default app;
