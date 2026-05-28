import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/processing";
import { isSandboxRawDelimitedConversationFile } from "@app/lib/api/files/sandbox_raw";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import { addFileToProject } from "@app/lib/api/projects/context";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileVersion } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { isConversationFileUseCase } from "@app/types/files";
import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type { HttpBindings } from "@hono/node-server";
import type { Context } from "hono";

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

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

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
    const webStream = new ReadableStream({
      start(controller) {
        readStream.on("data", (chunk) => controller.enqueue(chunk));
        readStream.on("end", () => controller.close());
        readStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        readStream.destroy();
      },
    });
    return new Response(webStream, {
      status: 200,
      headers: { "Content-Type": file.contentType },
    });
  }

  // Redirect to a signed URL.
  const url = await file.getSignedUrlForDownload(auth, "original");
  return ctx.redirect(url);
});

app.delete("/", async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

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

app.post("/", async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

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

  return ctx.json({ file: file.toJSON(auth) });
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

  if (file.useCaseMetadata?.spaceId && file.useCase === "project_context") {
    const featureFlags = await getFeatureFlags(auth);
    if (!featureFlags.includes("projects")) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Feature not supported",
        },
      });
    }
  }

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
