import { DustFileSystem } from "@app/lib/api/file_system";
import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import {
  type FramePublicationError,
  isFramePublicationError,
} from "@app/lib/api/frames/publication_storage";
import { publishFrameV2FromSource } from "@app/lib/api/frames/publish_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { createMountFrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import {
  PublishFrameError,
  publishFrame,
} from "@app/lib/api/viz/publish_frame";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { splitFrameEntryScopedPath } from "@app/types/mount_path";
import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FramePublishRequestSchema = z.object({
  manifestPath: z.string().min(1),
});

type FramePublishResponse = {
  frameId: string;
  manifestPath: string;
  publicationId?: string;
  warnings?: ValidationWarning[];
};

function frameErrorStatus(
  error: FramePublicationError | PublishFrameError | SandboxFunctionError
): 400 | 403 | 500 {
  if (isFramePublicationError(error)) {
    return error.code === "unauthorized" ? 403 : 400;
  }

  if (error instanceof PublishFrameError) {
    return error.code === "internal" ? 500 : 400;
  }

  return ["sandbox_unavailable", "reconcile_failed", "internal"].includes(
    error.code
  )
    ? 500
    : 400;
}

// Mounted at /api/v1/w/:wId/sandbox/frames.
const app = sandboxApp();

app.use("*", sandboxAuth({ allowedTokenKinds: ["action"] }));

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/publish",
  validate("json", FramePublishRequestSchema),
  async (ctx): HandlerResult<FramePublishResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot publish Frames.",
        },
      });
    }
    if (!(await hasFeatureFlag(auth, "frames_v2"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "Frames v2 is not enabled for this workspace.",
        },
      });
    }

    const conversation = await ConversationResource.fetchById(auth, claims.cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: `Conversation ${claims.cId} not found.`,
        },
      });
    }

    // Keep the request field name for compatibility. Legacy Frames pass their entry source path.
    const { manifestPath } = ctx.req.valid("json");
    const normalizedPath = DustFileSystem.normalizeScopedPath(manifestPath);
    if (!normalizedPath) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid Frame source path: ${manifestPath}`,
        },
      });
    }

    const fsResult = await DustFileSystem.fromScopedPath(auth, normalizedPath);
    if (fsResult.isErr()) {
      return apiError(ctx, {
        status_code: fsResult.error.code === "unauthorized" ? 403 : 400,
        api_error: {
          type: "invalid_request_error",
          message: fsResult.error.message,
        },
      });
    }
    const dustFs = fsResult.value;
    const mountFilePath = dustFs.toMountFilePath(normalizedPath);
    if (!mountFilePath) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid Frame source path: ${manifestPath}`,
        },
      });
    }

    const [frame] = await FileResource.fetchByMountFilePaths(auth, [
      mountFilePath,
    ]);
    if (!frame || (!frame.isFrameV2 && !frame.isInteractiveContent)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `No Frame found at ${normalizedPath}.`,
        },
      });
    }

    if (!frame.isFrameV2) {
      const splitResult = splitFrameEntryScopedPath(normalizedPath);
      if (splitResult.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: splitResult.error.message,
          },
        });
      }
      const { root, entryRelPath } = splitResult.value;

      const legacyPublication = await publishFrame(auth, {
        file: frame,
        reader: createMountFrameSourceReader(dustFs, root),
        entryRelPath,
        rootScopedPath: root,
        publishedByAgentConfigurationId: claims.aId,
      });
      if (legacyPublication.isErr()) {
        const status = frameErrorStatus(legacyPublication.error);
        return apiError(ctx, {
          status_code: status,
          api_error: {
            type:
              status === 500
                ? "internal_server_error"
                : "invalid_request_error",
            message: legacyPublication.error.message,
          },
        });
      }

      return ctx.json(
        {
          frameId: frame.sId,
          manifestPath: normalizedPath,
          warnings: legacyPublication.value.warnings,
        },
        200
      );
    }

    const publication = await publishFrameV2FromSource(auth, {
      conversation: conversation.toJSON(),
      frame,
      manifestPath: normalizedPath,
    });
    if (publication.isErr()) {
      const status = frameErrorStatus(publication.error);
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type:
            status === 500 ? "internal_server_error" : "invalid_request_error",
          message: publication.error.message,
        },
      });
    }

    return ctx.json(
      {
        frameId: frame.sId,
        manifestPath: normalizedPath,
        publicationId: publication.value.publicationId,
      },
      200
    );
  }
);

export default app;
