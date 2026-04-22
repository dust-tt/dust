import config from "@app/lib/api/config";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { CoreAPI } from "@app/types/core/core_api";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { isToolGeneratedFile } from "@dust-tt/client";
import * as fs from "fs";
import { Op } from "sequelize";

const BATCH_SIZE = 100;
const CONCURRENCY = 20;
const WORKSPACE_CONCURRENCY = 20;

const PASTED_CONTENT_TYPE = "text/vnd.dust.attachment.pasted";
const WEBHOOK_BODY_FILENAME_RE = /^webhook_body_\d+_\d+\.json$/;

/**
 * Purges conversation files that should not be semantically searchable from Qdrant, and
 * stamps them with skipDataSourceIndexing so conversation rendering no longer advertises them
 * as searchable.
 *
 * Three classes of files are covered:
 *  1. Offloaded tool outputs (via AgentMCPActionOutputItemModel):
 *     - Text-block offloads: large text blocks written to a text/plain file. Lowering
 *       FILE_OFFLOAD_TEXT_SIZE_BYTES from 400 KB -> 20 KB caused a +20% increase in points.
 *     - Browse/websearch files: handleWebbrowser (with summarisation) creates a text/plain
 *       file via uploadFileToConversationDataSource without skipDataSourceIndexing. The
 *       associated output item carries TOOL_OUTPUT.FILE and the sentinel
 *       "Web page content archived as a file.".
 *  2. Webhook trigger payloads (via FileModel): fileName matches
 *     webhook_body_<sourceId>_<epoch>.json, contentType "application/json". Pulled in as a
 *     content fragment on every trigger firing; the agent reads them inline, retrieval adds
 *     nothing.
 *  3. Pasted text (via FileModel): contentType "text/vnd.dust.attachment.pasted". Attached
 *     in the same turn as the user message; retrieval adds nothing over in-context reading.
 *
 * Safe to re-run: files already stamped with skipDataSourceIndexing are skipped.
 *
 * Re-indexing: when --execute is set, each deleted document is appended as a NDJSON line to
 * the manifest file (--manifest, defaults to purge_manifest_<timestamp>.ndjson in cwd).
 * Each line contains everything needed to restore the document to Qdrant if required.
 */

type PurgeStats = {
  totalProcessed: number;
  totalDeleted: number;
  totalSkipped: number;
};

async function purgeFile(
  auth: Authenticator,
  coreAPI: CoreAPI,
  file: FileResource,
  workspace: LightWorkspaceType,
  {
    execute,
    manifestFd,
    reason,
  }: { execute: boolean; manifestFd: number | null; reason: string },
  localLogger: Logger,
  stats: PurgeStats
): Promise<void> {
  // Skip files already stamped. Safe to re-run.
  if (file.useCaseMetadata?.skipDataSourceIndexing) {
    stats.totalSkipped++;
    return;
  }

  localLogger.info(
    {
      fileId: file.sId,
      workspaceId: workspace.sId,
      conversationId: file.useCaseMetadata?.conversationId,
      contentType: file.contentType,
      fileName: file.fileName,
      createdAt: file.createdAt,
      reason,
    },
    execute ? "Purging file" : "[dry-run] Would purge file"
  );

  if (!execute) {
    return;
  }

  // Resolve the conversation data source so we can delete the document from Qdrant.
  const dsRes = await getOrCreateConversationDataSourceFromFile(auth, file);
  if (dsRes.isErr()) {
    localLogger.error(
      {
        error: dsRes.error.message,
        fileId: file.sId,
        workspaceId: workspace.sId,
      },
      "Failed to resolve conversation data source. Skipping"
    );
    return;
  }

  const dataSource = dsRes.value;

  // Delete the document from Qdrant. The document ID is the file's sId.
  const delRes = await coreAPI.deleteDataSourceDocument({
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: file.sId,
    projectId: dataSource.dustAPIProjectId,
  });

  if (delRes.isErr()) {
    localLogger.error(
      {
        dataSourceId: dataSource.dustAPIDataSourceId,
        error: delRes.error.message,
        fileId: file.sId,
        projectId: dataSource.dustAPIProjectId,
        workspaceId: workspace.sId,
      },
      "Failed to delete document from Qdrant. Skipping metadata update"
    );
    return;
  }

  // Stamp the file so future conversation renders don't advertise it as searchable.
  // Using FileModel.update directly. FileResource.update is protected, and
  // setUseCaseMetadata triggers resolveAndSetMountFilePath which we don't need here.
  await FileModel.update(
    {
      useCaseMetadata: {
        ...file.useCaseMetadata,
        skipDataSourceIndexing: true,
      },
    },
    { where: { id: file.id } }
  );

  // Append a manifest line so the deletion can be reversed if needed.
  if (manifestFd !== null) {
    const entry = JSON.stringify({
      fileId: file.sId,
      workspaceId: workspace.sId,
      conversationId: file.useCaseMetadata?.conversationId ?? null,
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      contentType: file.contentType,
      fileName: file.fileName,
      createdAt: file.createdAt,
      reason,
    });
    fs.writeSync(manifestFd, entry + "\n");
  }

  stats.totalDeleted++;
}

async function purgeOffloadedToolOutputs(
  auth: Authenticator,
  coreAPI: CoreAPI,
  workspace: LightWorkspaceType,
  { execute, manifestFd }: { execute: boolean; manifestFd: number | null },
  localLogger: Logger,
  stats: PurgeStats
): Promise<void> {
  let cursorId = 0;

  while (true) {
    // Step 1: find output items that reference a file. Content filtering is done in JS below
    // because the content JSONB column has no GIN index. The indexed filters (workspaceId, id)
    // are the selective ones and map to the (workspaceId, id) composite index.
    // Cursor-based pagination (id > cursorId) avoids the O(offset) cost of OFFSET pagination.
    const outputItems = await AgentMCPActionOutputItemModel.findAll({
      attributes: ["id", "fileId", "content"],
      where: {
        workspaceId: workspace.id,
        fileId: { [Op.not]: null },
        id: { [Op.gt]: cursorId },
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (outputItems.length === 0) {
      break;
    }

    cursorId = outputItems[outputItems.length - 1].id;

    // Case 1: text-block offloads. `resource` carries mimeType "text/plain".
    // Case 2: browse/websearch files. `resource` carries mimeType TOOL_OUTPUT.FILE with the
    // sentinel text set by handleWebbrowser.
    const toolOutputsOffloadedFileIds = outputItems
      .filter((item) => {
        const c = item.content;
        return c.type === "resource" && c.resource?.mimeType === "text/plain";
      })
      .map((item) => item.fileId);

    const websearchBrowseFileIds = outputItems
      .filter((item) => {
        const c = item.content;

        return (
          isToolGeneratedFile(c) &&
          c.resource.text === "Web page content archived as a file."
        );
      })
      .map((item) => item.fileId);

    const fileIds = [
      ...toolOutputsOffloadedFileIds,
      ...websearchBrowseFileIds,
    ].filter((id): id is number => id !== null);

    if (fileIds.length === 0) {
      continue;
    }

    // Step 2: fetch FileResource objects for the matched IDs.
    const files = await FileResource.fetchByModelIdsWithAuth(auth, fileIds);

    // Safety check: only process tool_output/text-plain files.
    const toolOutputFiles = files.filter(
      (f) => f.useCase === "tool_output" && f.contentType === "text/plain"
    );

    stats.totalProcessed += toolOutputFiles.length;

    await concurrentExecutor(
      toolOutputFiles,
      (file) =>
        purgeFile(
          auth,
          coreAPI,
          file,
          workspace,
          { execute, manifestFd, reason: "offloaded_tool_output" },
          localLogger,
          stats
        ),
      { concurrency: CONCURRENCY }
    );
  }
}

async function purgeWebhooks(
  auth: Authenticator,
  coreAPI: CoreAPI,
  workspace: LightWorkspaceType,
  { execute, manifestFd }: { execute: boolean; manifestFd: number | null },
  localLogger: Logger,
  stats: PurgeStats
): Promise<void> {
  let cursorId = 0;

  while (true) {
    // Coarse filter at the DB (contentType); the exact webhook_body filename regex is applied
    // in JS since fileName is not indexed for LIKE patterns. Cursor-based pagination (id >
    // cursorId) avoids the O(offset) cost of OFFSET.
    const rows = await FileModel.findAll({
      attributes: ["id", "fileName", "contentType"],
      where: {
        workspaceId: workspace.id,
        id: { [Op.gt]: cursorId },
        useCase: "conversation",
        contentType: "application/json",
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (rows.length === 0) {
      break;
    }

    cursorId = rows[rows.length - 1].id;

    const matchedIds = rows
      .filter((r) => WEBHOOK_BODY_FILENAME_RE.test(r.fileName))
      .map((r) => r.id);

    if (matchedIds.length === 0) {
      continue;
    }

    const files = await FileResource.fetchByModelIdsWithAuth(auth, matchedIds);

    // Safety: re-confirm shape after the FileResource roundtrip.
    const targets = files.filter(
      (f) =>
        f.useCase === "conversation" &&
        f.contentType === "application/json" &&
        WEBHOOK_BODY_FILENAME_RE.test(f.fileName)
    );

    stats.totalProcessed += targets.length;

    await concurrentExecutor(
      targets,
      (file) =>
        purgeFile(
          auth,
          coreAPI,
          file,
          workspace,
          { execute, manifestFd, reason: "webhook_body" },
          localLogger,
          stats
        ),
      { concurrency: CONCURRENCY }
    );
  }
}

async function purgePastedFiles(
  auth: Authenticator,
  coreAPI: CoreAPI,
  workspace: LightWorkspaceType,
  { execute, manifestFd }: { execute: boolean; manifestFd: number | null },
  localLogger: Logger,
  stats: PurgeStats
): Promise<void> {
  let cursorId = 0;

  while (true) {
    // PASTED_CONTENT_TYPE is unique to pasted attachments, no further filter needed.
    const rows = await FileModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: workspace.id,
        id: { [Op.gt]: cursorId },
        useCase: "conversation",
        contentType: PASTED_CONTENT_TYPE,
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (rows.length === 0) {
      break;
    }

    cursorId = rows[rows.length - 1].id;

    const files = await FileResource.fetchByModelIdsWithAuth(
      auth,
      rows.map((r) => r.id)
    );

    // Safety: re-confirm shape after the FileResource roundtrip.
    const targets = files.filter(
      (f) =>
        f.useCase === "conversation" && f.contentType === PASTED_CONTENT_TYPE
    );

    stats.totalProcessed += targets.length;

    await concurrentExecutor(
      targets,
      (file) =>
        purgeFile(
          auth,
          coreAPI,
          file,
          workspace,
          { execute, manifestFd, reason: "pasted_text" },
          localLogger,
          stats
        ),
      { concurrency: CONCURRENCY }
    );
  }
}

async function purgeWorkspace(
  workspace: LightWorkspaceType,
  { execute, manifestFd }: { execute: boolean; manifestFd: number | null },
  localLogger: Logger
) {
  // Authenticator init fetches OAuth credentials if BYOK is available on the plan via the OAuth
  // service. Prodbox can't reach oauth. Simply skip the workspace.
  let auth: Authenticator;
  try {
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  } catch (err) {
    localLogger.error(
      { workspaceId: workspace.sId, error: normalizeError(err) },
      "Failed to initialize authenticator (OAuth service unavailable?), skipping workspace"
    );
    return;
  }
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const stats: PurgeStats = {
    totalProcessed: 0,
    totalDeleted: 0,
    totalSkipped: 0,
  };

  await purgeOffloadedToolOutputs(
    auth,
    coreAPI,
    workspace,
    { execute, manifestFd },
    localLogger,
    stats
  );

  await purgeWebhooks(
    auth,
    coreAPI,
    workspace,
    { execute, manifestFd },
    localLogger,
    stats
  );

  await purgePastedFiles(
    auth,
    coreAPI,
    workspace,
    { execute, manifestFd },
    localLogger,
    stats
  );

  localLogger.info(
    {
      execute,
      totalDeleted: stats.totalDeleted,
      totalProcessed: stats.totalProcessed,
      totalSkipped: stats.totalSkipped,
      workspaceId: workspace.sId,
    },
    "Done processing workspace"
  );
}

makeScript(
  {
    manifest: {
      type: "string",
      default: "",
      describe:
        "Path to the NDJSON manifest file for deleted documents (defaults to purge_manifest_<timestamp>.ndjson in cwd)",
    },
    concurrency: {
      type: "number",
      default: WORKSPACE_CONCURRENCY,
      describe: "Number of concurrent file deletions and API calls",
    },
  },
  async ({ concurrency, execute, manifest }, scriptLogger) => {
    let manifestPath: string | null = null;
    let manifestFd: number | null = null;

    if (execute) {
      manifestPath =
        manifest ||
        `purge_manifest_${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`;
      manifestFd = fs.openSync(manifestPath, "a");
      scriptLogger.info(
        { manifestPath },
        "Writing deleted documents to manifest"
      );
    }

    try {
      await runOnAllWorkspaces(
        async (workspace) => {
          await purgeWorkspace(
            workspace,
            { execute, manifestFd },
            scriptLogger.child({ workspaceId: workspace.sId })
          );
        },
        { concurrency }
      );
    } finally {
      if (manifestFd !== null) {
        fs.closeSync(manifestFd);
        scriptLogger.info({ manifestPath }, "Manifest written");
      }
    }
  }
);
