import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { fileAttachmentLocation } from "@app/lib/resources/content_fragment_resource";
import { isContentFragmentType } from "@app/types/content_fragment";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

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
const app = createHono<WorkspaceAwareCtx>();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();
  const { cId: conversationId, mId: messageId } = ctx.req.valid("param");

  // oxlint-disable-next-line dust/noExpensiveConversationFetch -- intentional full conversation load
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

export default app;
