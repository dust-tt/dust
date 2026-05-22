import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { fileAttachmentLocation } from "@app/lib/resources/content_fragment_resource";
import { isContentFragmentType } from "@app/types/content_fragment";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import type formidable from "formidable";

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
const app = workspaceApp();

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

  try {
    const parsed = await ctx.req.parseBody({ all: true });
    const rawFiles = parsed.file;
    const file =
      rawFiles instanceof File
        ? rawFiles
        : Array.isArray(rawFiles) && rawFiles[0] instanceof File
          ? rawFiles[0]
          : null;

    if (!file) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "No file uploaded",
        },
      });
    }

    // Persist to a temp file so the existing lib code (which reads from
    // formidable.File.filepath) can keep working unchanged.
    const tmpDir = await mkdtemp(join(tmpdir(), "raw-content-fragment-"));
    const localPath = join(tmpDir, "upload");
    await writeFile(localPath, Buffer.from(await file.arrayBuffer()));

    const formidableFile: formidable.File = {
      filepath: localPath,
      originalFilename: file.name ?? null,
      size: file.size,
      newFilename: "upload",
      mimetype: file.type || null,
      hash: null,
      hashAlgorithm: false,
      mtime: null,
      toJSON: () => ({}) as never,
      toString: () => localPath,
    } as unknown as formidable.File;

    await privateUploadGcs.uploadFileToBucket(formidableFile, filePath);

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
