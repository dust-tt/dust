import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/processing";
import { isSandboxRawDelimitedConversationFile } from "@app/lib/api/files/sandbox_raw";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileVersion } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import {
  isConversationFileUseCase,
  isPubliclySupportedUseCase,
} from "@app/types/files";
import { readableToReadableStream } from "@app/types/shared/utils/streams";
import { createHono } from "@front-api/lib/hono";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { HttpBindings } from "@hono/node-server";
import type { Context } from "hono";
import { z } from "zod";

const ParamsSchema = z.object({
  fileId: z.string(),
});

const VALID_VIEW_VERSIONS: FileVersion[] = ["original", "processed"];

function isValidViewVersion(
  version: string | undefined
): version is FileVersion {
  return (
    typeof version === "string" &&
    VALID_VIEW_VERSIONS.includes(version as FileVersion)
  );
}

const VALID_ACTIONS = ["view", "download"] as const;
type Action = (typeof VALID_ACTIONS)[number];

function isValidAction(action: string | undefined): action is Action {
  return typeof action === "string" && VALID_ACTIONS.includes(action as Action);
}

/**
 * Determines the appropriate action for a file based on security rules.
 * Only safe file types can be viewed; all unsafe types are downloaded.
 */
function getSecureFileAction(
  action: string | undefined,
  file: FileResource
): Action {
  if (!isValidAction(action)) {
    return "download";
  }
  if (action === "view" && !file.isSafeToDisplay()) {
    return "download";
  }
  return action;
}

// Mounted at /api/v1/w/:wId/files/:fileId.
//
// We extend the public API context with `HttpBindings` so we can reach the
// underlying Node `IncomingMessage` via `ctx.env.incoming` and hand it to
// `processAndStoreFile` for multipart parsing.
const app = createHono<PublicApiCtx & { Bindings: HttpBindings }>();

/**
 * @ignoreswagger
 */

app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { fileId } = ctx.req.valid("param");

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "The file was not found.",
      },
    });
  }

  if (!auth.isSystemKey()) {
    // Limit use-case if not a system key.
    if (!isPubliclySupportedUseCase(file.useCase)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The file use case is not supported by the API.",
        },
      });
    }
  }

  // Check if the user has access to the file based on its useCase and useCaseMetadata
  const accessError = await checkFileAccess(ctx, auth, file);
  if (accessError) {
    return accessError;
  }

  const action = getSecureFileAction(ctx.req.query("action"), file);
  const versionParam = ctx.req.query("version");
  const version: FileVersion = isValidViewVersion(versionParam)
    ? versionParam
    : "original";

  if (action === "view") {
    const readStream = file.getReadStream({
      auth,
      version,
    });
    return new Response(readableToReadableStream(readStream), {
      status: 200,
      headers: { "Content-Type": file.contentType },
    });
  }

  // Redirect to a signed URL.
  const url = await file.getSignedUrlForDownload(auth, version);
  return ctx.redirect(url);
});

app.delete("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { fileId } = ctx.req.valid("param");

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "The file was not found.",
      },
    });
  }

  if (!auth.isSystemKey()) {
    if (!isPubliclySupportedUseCase(file.useCase)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The file use case is not supported by the API.",
        },
      });
    }
  }

  const accessError = await checkFileAccess(ctx, auth, file);
  if (accessError) {
    return accessError;
  }

  if (!auth.isBuilder() && file.useCase !== "conversation") {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can delete files.",
      },
    });
  }

  const deleteRes = await file.delete(auth);
  if (deleteRes.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Failed to delete the file.",
      },
    });
  }

  return ctx.body(null, 204);
});

app.post("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { fileId } = ctx.req.valid("param");

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "The file was not found.",
      },
    });
  }

  if (!auth.isSystemKey()) {
    if (!isPubliclySupportedUseCase(file.useCase)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The file use case is not supported by the API.",
        },
      });
    }
  }

  const accessError = await checkFileAccess(ctx, auth, file);
  if (accessError) {
    return accessError;
  }

  if (!auth.isBuilder() && file.useCase !== "conversation") {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can modify files.",
      },
    });
  }

  // processAndStoreFile.parseUploadRequest expects a Node IncomingMessage to
  // stream multipart parsing; @hono/node-server exposes it on ctx.env. In
  // tests using `honoApp.request()` (Web fetch API) env is undefined; that's
  // fine because the test mocks `processAndStoreFile` and never reads the
  // value.
  const r = await processAndStoreFile(auth, {
    file,
    content: {
      type: "incoming_message",
      value: ctx.env?.incoming as HttpBindings["incoming"],
    },
  });

  if (r.isErr()) {
    return apiError(ctx, {
      status_code: r.error.code === "internal_server_error" ? 500 : 400,
      api_error: {
        type: r.error.code,
        message: r.error.message,
      },
    });
  }

  // For files with useCase "conversation" that support upsert, directly add them to the data source.
  if (
    file.useCase === "conversation" &&
    !isSandboxRawDelimitedConversationFile(file) &&
    isFileTypeUpsertableForUseCase(file)
  ) {
    const jitDataSource = await getOrCreateConversationDataSourceFromFile(
      auth,
      file
    );
    if (jitDataSource.isErr()) {
      logger.warn({
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        contentType: file.contentType,
        useCase: file.useCase,
        useCaseMetadata: file.useCaseMetadata,
        message: "Failed to get or create JIT data source.",
        error: jitDataSource.error,
      });
    } else {
      const rUpsert = await processAndUpsertToDataSource(
        auth,
        jitDataSource.value,
        { file }
      );
      if (rUpsert.isErr()) {
        logger.error({
          fileModelId: file.id,
          workspaceId: auth.workspace()?.sId,
          contentType: file.contentType,
          useCase: file.useCase,
          useCaseMetadata: file.useCaseMetadata,
          message: "Failed to upsert the file.",
          error: rUpsert.error,
        });
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert the file.",
          },
        });
      }
    }
  }

  return ctx.json({ file: file.toPublicJSON(auth) });
});

/**
 * Validates that the caller can access the file based on its use case and
 * associated space/conversation. Returns a Response to short-circuit when
 * denied, or `null` when access is granted.
 */
async function checkFileAccess(
  ctx: Context,
  auth: Authenticator,
  file: FileResource
): Promise<Response | null> {
  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    // For conversation files, check if the user has access to the conversation
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  if (
    (file.useCase === "folders_document" ||
      file.useCase === "project_context") &&
    file.useCaseMetadata?.spaceId
  ) {
    // For folder documents and project context, check if the user has access to the space
    const space = await SpaceResource.fetchById(
      auth,
      file.useCaseMetadata.spaceId
    );
    if (!space || !space.canRead(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  return null;
}

export default app;
