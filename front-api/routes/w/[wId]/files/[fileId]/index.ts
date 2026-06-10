import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/processing";
import { isSandboxRawDelimitedConversationFile } from "@app/lib/api/files/sandbox_raw";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import { addFileToProject } from "@app/lib/api/projects/context";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileVersion } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { isConversationFileUseCase } from "@app/types/files";
import { readableToReadableStream } from "@app/types/shared/utils/streams";
import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { HttpBindings } from "@hono/node-server";
import type { Context } from "hono";
import { z } from "zod";

const ParamsSchema = z.object({
  fileId: z.string(),
});

import editText from "./edit-text";
import exportApp from "./export";
import metadata from "./metadata";
import rename from "./rename";
import saveInProject from "./save-in-project";
import shareApp from "./share";
import signedUrl from "./signed-url";

const VALID_VIEW_VERSIONS: FileVersion[] = ["original", "processed", "public"];
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

// Mounted at /api/w/:wId/files/:fileId.
const app = createHono<WorkspaceAwareCtx & { Bindings: HttpBindings }>();

/**
 * @swagger
 * /api/w/{wId}/files/{fileId}:
 *   get:
 *     summary: Get or download a file
 *     description: View or download a file. Use query parameters `version` (original, processed, public) and `action` (view, download).
 *     tags:
 *       - Private Files
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileId
 *         required: true
 *         description: ID of the file
 *         schema:
 *           type: string
 *       - in: query
 *         name: version
 *         required: false
 *         description: File version to retrieve
 *         schema:
 *           type: string
 *           enum: [original, processed, public]
 *       - in: query
 *         name: action
 *         required: false
 *         description: Action to perform
 *         schema:
 *           type: string
 *           enum: [view, download]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: File content or redirect to download URL
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       302:
 *         description: Redirect to signed download URL
 *       404:
 *         description: File not found
 *   post:
 *     summary: Upload file content
 *     description: Process and store the uploaded file content.
 *     tags:
 *       - Private Files
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileId
 *         required: true
 *         description: ID of the file
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:
 *                   $ref: '#/components/schemas/PrivateFileWithUploadUrl'
 *       400:
 *         description: Invalid file content (e.g. a CSV that is not UTF-8 encoded)
 *       403:
 *         description: Permission denied
 *       404:
 *         description: File not found
 *   delete:
 *     summary: Delete a file
 *     description: Delete a file from the workspace.
 *     tags:
 *       - Private Files
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileId
 *         required: true
 *         description: ID of the file
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       204:
 *         description: File deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: File not found
 */

app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { fileId } = ctx.req.valid("param");

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const accessCheck = await checkFileAccess(ctx, file);
  if (accessCheck) {
    return accessCheck;
  }

  const action = getSecureFileAction(ctx.req.query("action"), file);
  if (action === "view") {
    const versionParam = ctx.req.query("version");
    const version = isValidViewVersion(versionParam)
      ? versionParam
      : "original";

    const readStream = file.getReadStream({ auth, version });
    return new Response(readableToReadableStream(readStream), {
      status: 200,
      headers: { "Content-Type": file.contentType },
    });
  }

  // Redirect to a signed URL.
  const url = await file.getSignedUrlForDownload(auth, "original");
  return ctx.redirect(url);
});

app.delete("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { fileId } = ctx.req.valid("param");

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const accessCheck = await checkFileAccess(ctx, file);
  if (accessCheck) {
    return accessCheck;
  }

  // Plan-mode files are agent-owned: the user interacts with them only through
  // the agent (via messages and approval decisions), never by direct mutation.
  // The agent can retire a plan via the `close_plan` tool.
  if (file.useCaseMetadata?.isPlanFile) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "plan.md is managed by the agent and cannot be deleted directly. Ask the agent to close the plan.",
      },
    });
  }

  const space = await getSpaceForFile(auth, file);
  const isFileAuthor = file.userId === auth.user()?.id;
  const isUploadUseCase =
    file.useCase === "upsert_table" || file.useCase === "folders_document";
  const canWriteInSpace = space ? space.canWrite(auth) : false;

  if (
    isUploadUseCase &&
    !((isFileAuthor && canWriteInSpace) || auth.isBuilder())
  ) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You cannot edit files in that space.",
      },
    });
  } else if (!auth.isBuilder() && file.useCase !== "conversation") {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can modify files.",
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
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const accessCheck = await checkFileAccess(ctx, file);
  if (accessCheck) {
    return accessCheck;
  }

  // Plan-mode files are agent-owned; users cannot upload over them.
  if (file.useCaseMetadata?.isPlanFile) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "plan.md is managed by the agent and cannot be overwritten directly.",
      },
    });
  }

  const space = await getSpaceForFile(auth, file);
  const isFileAuthor = file.userId === auth.user()?.id;
  const isUploadUseCase =
    file.useCase === "upsert_table" || file.useCase === "folders_document";
  const canWriteInSpace = space ? space.canWrite(auth) : false;

  if (
    isUploadUseCase &&
    !((isFileAuthor && canWriteInSpace) || auth.isBuilder())
  ) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You cannot edit files in that space.",
      },
    });
  } else if (
    !space &&
    !auth.isBuilder() &&
    file.useCase !== "conversation" &&
    file.useCase !== "avatar"
  ) {
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

  // For files with useCase "conversation" that support upsert, directly add
  // them to the data source.
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
        // Invalid CSV content is a user error (e.g. unsupported encoding); surface the
        // actionable message instead of a generic 500.
        if (rUpsert.error.code === "invalid_csv_content") {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: rUpsert.error.message,
            },
          });
        }
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert the file.",
          },
        });
      }
    }
  } else if (file.useCase === "project_context" && space) {
    const addFileToProjectRes = await addFileToProject(auth, {
      file,
      space,
    });

    if (addFileToProjectRes.isErr()) {
      logger.error({
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        contentType: file.contentType,
        useCase: file.useCase,
        useCaseMetadata: file.useCaseMetadata,
        message: "Failed to add the file to the Pod.",
        error: addFileToProjectRes.error,
      });
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to add the file to the Pod.",
        },
      });
    }
  }

  return ctx.json({
    file: {
      ...file.toJSON(auth),
      path: file.toScopedPath(auth),
    },
  });
});

app.route("/edit-text", editText);
app.route("/export", exportApp);
app.route("/metadata", metadata);
app.route("/rename", rename);
app.route("/save-in-project", saveInProject);
app.route("/share", shareApp);
app.route("/signed-url", signedUrl);

async function getSpaceForFile(
  auth: Authenticator,
  file: FileResource
): Promise<SpaceResource | null> {
  if (!file.useCaseMetadata?.spaceId) {
    return null;
  }
  return SpaceResource.fetchById(auth, file.useCaseMetadata.spaceId);
}

/**
 * Validates that the caller can access the file based on its use case and
 * associated space/conversation. Returns a Response to short-circuit when
 * denied, or `null` when access is granted.
 */
async function checkFileAccess(
  ctx: Context,
  file: FileResource
): Promise<Response | null> {
  const auth = ctx.get("auth");

  const space = await getSpaceForFile(auth, file);

  if (
    file.useCase === "folders_document" ||
    file.useCase === "project_context"
  ) {
    if (!space || !space.canRead(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    if (!space.isProject() && file.useCase === "project_context") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Space is not a Pod",
        },
      });
    }
  }

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  }

  return null;
}

export default app;
