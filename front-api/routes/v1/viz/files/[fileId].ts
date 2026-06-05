/* eslint-disable dust/enforce-client-types-in-public-api */

import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import { assertVizFileAuthorized } from "@app/lib/api/viz/authorized_file_access";
import {
  canAccessFileInConversation,
  canAccessFileInProject,
} from "@app/lib/api/viz/file_access";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
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

  // Get file info using the fileToken from the access token.
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

  // If current share scope differs from token scope, reject. It means share scope changed.
  if (shareScope !== tokenPayload.shareScope) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Only allow conversation Frame files.
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

  // Check if file is safe to display.
  if (!frameFile.isSafeToDisplay()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not safe for public display.",
      },
    });
  }

  // If file is shared publicly, ensure workspace allows it.
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

  // Frame must have a conversation context or a project context
  const frameConversationId = frameFile.useCaseMetadata?.conversationId;
  const frameSpaceId = frameFile.useCaseMetadata?.spaceId;
  if (!frameConversationId && !frameSpaceId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Frame missing conversation context or project context.",
      },
    });
  }

  // Load the requested file within the same workspace context.
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
  switch (authorizationMode) {
    case "denied":
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    case "legacy": {
      let hasAccessRes: Result<true, Error>;
      if (frameConversationId) {
        hasAccessRes = await canAccessFileInConversation(owner, {
          file: targetFile,
          requestedConversationId: frameConversationId,
        });
      } else if (frameSpaceId) {
        hasAccessRes = await canAccessFileInProject(owner, {
          file: targetFile,
          requestedProjectId: frameSpaceId,
        });
      } else {
        throw new Error(
          "Invalid file context: both conversationId and spaceId are missing"
        );
      }

      if (hasAccessRes.isErr()) {
        logger.error(
          {
            erroor: hasAccessRes.error,
          },
          "Error checking file access in conversation"
        );

        return apiError(ctx, {
          status_code: 404,
          api_error: { type: "file_not_found", message: "File not found." },
        });
      }
      break;
    }
    case "authorized":
      break;
    default:
      return assertNever(authorizationMode);
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
