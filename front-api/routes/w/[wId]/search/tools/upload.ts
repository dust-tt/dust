/** @ignoreswagger */
import {
  downloadAndUploadToolFile,
  getToolAccessToken,
  ToolUploadRequestBodySchema,
} from "@app/lib/search/tools/search";
import type { FileType } from "@app/types/files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

interface ToolUploadResponseBody {
  file: FileType;
}

// Mounted at /api/w/:wId/search/tools/upload.
const app = workspaceApp();

app.post(
  "/",
  validate("json", ToolUploadRequestBodySchema),
  async (ctx): HandlerResult<ToolUploadResponseBody> => {
    const auth = ctx.get("auth");

    const {
      serverViewId,
      externalId,
      useCase,
      useCaseMetadata,
      conversationId,
      serverName,
      serverIcon,
    } = ctx.req.valid("json");

    const tokenResult = await getToolAccessToken({ auth, serverViewId });
    if (tokenResult.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: tokenResult.error.message,
        },
      });
    }

    const { tool, accessToken, metadata } = tokenResult.value;
    const result = await downloadAndUploadToolFile({
      auth,
      tool,
      accessToken,
      externalId,
      useCase,
      useCaseMetadata: {
        ...(useCaseMetadata ? useCaseMetadata : {}),
        conversationId,
      },
      metadata,
      serverName,
      serverIcon,
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

    return ctx.json({
      file: result.value,
    });
  }
);

export default app;
