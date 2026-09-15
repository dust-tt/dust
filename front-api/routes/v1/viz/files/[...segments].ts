/* eslint-disable dust/enforce-client-types-in-public-api */

import { formatFramePackageRelativePath } from "@app/lib/api/frames/package_file_ref_paths";
import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import {
  assertVizFileAuthorized,
  readAllowlistedScopedVizFile,
  resolveAllowlistedCanonicalPath,
} from "@app/lib/api/viz/authorized_file_access";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import { parseRawVizScope } from "@app/types/mount_path";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import path from "path";
import type { Readable } from "stream";
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
 * (e.g., GET /api/v1/viz/files/conversation/chart.png), or by Frame-package-relative path
 * (e.g., GET /api/v1/viz/files/frame/data.csv for useFile("./data.csv")).
 * Access is granted via the same JWT used by /api/v1/viz/files/[fileId].
 *
 * Single-segment requests (fil_xxx) are routed to [fileId].ts.
 * This catch-all handles multi-segment scoped paths only.
 */
app.get("/:scope/:rel{.+}", validate("param", ParamsSchema), async (ctx) => {
  const { scope: rawScope, rel } = ctx.req.valid("param");

  const isFramePackageScope = rawScope === "frame";
  if (!isFramePackageScope && !parseRawVizScope(rawScope)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid scope prefix "${rawScope}": expected "conversation", "project", "conversation-{id}", "pod-{id}", or "frame".`,
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

  const result = await FileResource.fetchByShareTokenWithContent(
    tokenPayload.fileToken
  );
  if (!result) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const {
    file: frameFile,
    content: frameContent,
    shareScope,
    authorizedFileAccess,
    workspace: owner,
  } = result;

  if (shareScope !== tokenPayload.shareScope) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  if (!frameFile.isShareableFrame) {
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

  if (isFramePackageScope && !isSafeFrameRelativePath(normalizedRel)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid Frame package-relative path.",
      },
    });
  }

  const requestedRef = isFramePackageScope
    ? formatFramePackageRelativePath(normalizedRel)
    : `${rawScope}/${normalizedRel}`;

  // Resolve package-relative allowlist entries against the Frame's *current* source root.
  let packageRoot: string | null = null;
  if (authorizedFileAccess?.generatedByUserId) {
    const author = await UserResource.fetchByModelId(
      authorizedFileAccess.generatedByUserId
    );
    if (author) {
      const authorAuth = await Authenticator.fromUserIdAndWorkspaceId(
        author.sId,
        owner.sId
      );
      packageRoot = frameFile.getFrameV2SourceDirectoryPath(authorAuth);
    }
  }

  const authorizationMode = await assertVizFileAuthorized({
    authorizedFileAccess,
    requestedRef,
    owner,
    frameContent,
    packageRoot,
  });
  if (authorizationMode === "denied" || !authorizedFileAccess) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const canonicalScopedPath = resolveAllowlistedCanonicalPath(
    authorizedFileAccess,
    requestedRef,
    { packageRoot }
  );
  if (!canonicalScopedPath) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const allowlistedFileResult = await readAllowlistedScopedVizFile({
    authorizedFileAccess,
    canonicalScopedPath,
    workspace: owner,
  });
  if (allowlistedFileResult.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { contentType } = allowlistedFileResult.value;
  const nodeStream: Readable = allowlistedFileResult.value.stream;
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
