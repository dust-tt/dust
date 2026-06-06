/* eslint-disable dust/enforce-client-types-in-public-api */

import {
  buildCanonicalScopedPathFromVizScope,
  parseRawVizScope,
} from "@app/lib/api/files/mount_path";
import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import path from "path";
import { z } from "zod";

const ParamsSchema = z.object({
  scope: z.string(),
  rel: z.string(),
});

// Mounted at /api/v1/viz/files; serves multi-segment scoped paths only.
const app = unauthedApp();

/**
 * @ignoreswagger
 *
 * Serves files referenced from a frame by scoped resource path
 * (e.g., GET /api/v1/viz/files/conversation/chart.png).
 * Access is granted via the same JWT used by /api/v1/viz/files/[fileId].
 *
 * Single-segment requests (fil_xxx) are routed to [fileId].ts.
 * This catch-all handles multi-segment scoped paths only.
 */
app.get("/:scope/:rel{.+}", validate("param", ParamsSchema), async (ctx) => {
  const { scope: rawScope, rel } = ctx.req.valid("param");

  const scope = parseRawVizScope(rawScope);
  if (!scope) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid scope prefix "${rawScope}": expected "conversation", "project", "conversation-{id}", or "pod-{id}".`,
      },
    });
  }

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

  // Get file info and build the DustFileSystem scoped to this frame's authorized paths.
  const result = await FileResource.fetchByShareToken(tokenPayload.fileToken);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { file: frameFile, shareScope, conversationSpaceId, fs } = result.value;

  // If current share scope differs from token scope, reject. It means share scope changed.
  if (shareScope !== tokenPayload.shareScope) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  // Only allow frame files.
  if (!frameFile.isInteractiveContent) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only frame files can be shared publicly.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchByModelId(
    frameFile.workspaceId
  );
  if (!workspace) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  // If file is shared publicly, ensure workspace allows it.
  if (
    shareScope === "public" &&
    !workspace.canShareInteractiveContentPublicly
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const normalizedRel = path.posix.normalize(rel);

  if (normalizedRel.startsWith("..") || normalizedRel.startsWith("/")) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside allowed scope.",
      },
    });
  }

  const canonicalPathResult = buildCanonicalScopedPathFromVizScope(
    scope,
    normalizedRel,
    {
      conversationId:
        frameFile.useCaseMetadata?.conversationId ??
        frameFile.useCaseMetadata?.sourceConversationId ??
        null,
      spaceId: frameFile.useCaseMetadata?.spaceId ?? conversationSpaceId,
    }
  );
  if (canonicalPathResult.isErr()) {
    switch (canonicalPathResult.error.code) {
      case "missing_conversation_context":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Frame has no conversation context for this path.",
          },
        });
      case "missing_pod_context":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Frame has no project context for this path.",
          },
        });
      case "conversation_context_mismatch":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Access denied: conversation ID does not match frame context.",
          },
        });
      case "pod_context_mismatch":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Access denied: pod ID does not match frame context.",
          },
        });
      default:
        return assertNever(canonicalPathResult.error);
    }
  }
  const canonicalScopedPath = canonicalPathResult.value;

  const statResult = await fs.stat(canonicalScopedPath);
  if (statResult.isErr() || !statResult.value) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }
  const { contentType } = statResult.value;

  const readResult = await fs.read(canonicalScopedPath);
  if (readResult.isErr() || !readResult.value) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const nodeStream = readResult.value;
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => {
        logger.error({ err, canonicalScopedPath }, "Error streaming viz file");
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
});

export default app;
