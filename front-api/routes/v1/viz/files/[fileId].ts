/* eslint-disable dust/enforce-client-types-in-public-api */

import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import { assertVizFileAuthorized } from "@app/lib/api/viz/authorized_file_access";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { isInteractiveContentType } from "@app/types/files";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  fileId: z.string().min(1),
});

// Mounted at /api/v1/viz/files; serves single-segment file IDs (fil_xxx).
const app = unauthedApp();

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get files used in a vizualisation. This endpoint is only called
 * when rendering vizualisations with an access token.
 */
app.get("/:fileId", validate("param", ParamsSchema), async (ctx) => {
  const { fileId } = ctx.req.valid("param");

  const tokenRes = extractAndVerifyVizAccessTokenFromHeader(
    ctx.req.header("authorization")
  );
  if (tokenRes.isErr()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: tokenRes.error,
      },
    });
  }
  const tokenPayload = tokenRes.value;

  const result = await FileResource.fetchByShareTokenWithContent(
    tokenPayload.fileToken
  );
  if (!result) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchByModelId(
    result.file.workspaceId
  );
  if (!workspace) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const {
    file: frameFile,
    content: frameContent,
    shareScope,
    authorizedFileAccess,
  } = result;

  if (shareScope !== tokenPayload.shareScope) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  if (
    !frameFile.isInteractiveContent ||
    !isInteractiveContentType(frameFile.contentType)
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be shared publicly.",
      },
    });
  }

  if (!frameFile.isSafeToDisplay()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not safe for public display.",
      },
    });
  }

  if (
    shareScope === "public" &&
    !workspace.canShareInteractiveContentPublicly
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const owner = renderLightWorkspaceType({ workspace });

  const targetFile = await FileResource.unsafeFetchByIdInWorkspace(
    owner,
    fileId
  );
  if (!targetFile) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const authorizationMode = await assertVizFileAuthorized({
    authorizedFileAccess,
    requestedRef: fileId,
    owner,
    frameContent,
  });
  if (authorizationMode === "denied") {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const readStream = targetFile.getSharedReadStream(owner, "original");
  const webStream = new ReadableStream({
    start(controller) {
      readStream.on("data", (chunk) => controller.enqueue(chunk));
      readStream.on("end", () => controller.close());
      readStream.on("error", (err) => {
        logger.error({ err, fileId }, "Error streaming viz file");
        controller.error(err);
      });
    },
    cancel() {
      readStream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: { "Content-Type": targetFile.contentType },
  });
});

export default app;
