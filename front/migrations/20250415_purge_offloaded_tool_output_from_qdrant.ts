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
import type { LightWorkspaceType } from "@app/types/user";
import * as fs from "fs";
import { Op } from "sequelize";

const CONCURRENCY = 8;
const BATCH_SIZE = 100;

/**
 * Purges tool-output files that were offloaded to disk because their content exceeded the size
 * threshold (FILE_OFFLOAD_TEXT_SIZE_BYTES) from Qdrant, and stamps them with
 * skipDataSourceIndexing so the conversation render no longer advertises them as searchable.
 *
 * Background: lowering the threshold from 400 KB -> 20 KB caused a +20% increase in indexed
 * points. These files are "never" used for semantic search, models read them directly.
 * Going forward, new offloaded files are created with skipDataSourceIndexing: true (see
 * mcp_execution.ts). This script cleans up the already-indexed ones.
 *
 * Safe to re-run: files already stamped with skipDataSourceIndexing are skipped.
 *
 * Re-indexing: when --execute is set, each deleted document is appended as a NDJSON line to
 * the manifest file (--manifest, defaults to purge_manifest_<timestamp>.ndjson in cwd).
 * Each line contains everything needed to restore the document to Qdrant if required.
 */

async function purgeWorkspace(
  workspace: LightWorkspaceType,
  { execute, manifestFd }: { execute: boolean; manifestFd: number | null },
  localLogger: Logger
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  let offset = 0;
  let totalProcessed = 0;
  let totalDeleted = 0;
  let totalSkipped = 0;

  while (true) {
    // Step 1: find output items that reference a file. Content filtering is done in JS below
    // because the content JSONB column has no GIN index. The indexed filters (workspaceId,
    // fileId IS NOT NULL) are the selective ones.
    const outputItems = await AgentMCPActionOutputItemModel.findAll({
      attributes: ["fileId", "content"],
      where: {
        workspaceId: workspace.id,
        fileId: { [Op.not]: null },
      },
      limit: BATCH_SIZE,
      offset,
    });

    if (outputItems.length === 0) {
      break;
    }

    offset += outputItems.length;

    // Keep only items whose content is a plain-text resource block. Web browser files use
    // INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE as their mimeType and must be excluded.
    const fileIds = outputItems
      .filter((item) => {
        const c = item.content;
        return c.type === "resource" && c.resource?.mimeType === "text/plain";
      })
      .map((item) => item.fileId)
      .filter((id): id is number => id !== null);

    if (fileIds.length === 0) {
      continue;
    }

    // Step 2: fetch FileResource objects for the matched IDs.
    const files = await FileResource.fetchByModelIdsWithAuth(auth, fileIds);

    // Safety check: only process tool_output/text-plain files.
    const toolOutputFiles = files.filter(
      (f) => f.useCase === "tool_output" && f.contentType === "text/plain"
    );

    totalProcessed += toolOutputFiles.length;

    await concurrentExecutor(
      toolOutputFiles,
      async (file) => {
        // Skip files already stamped. Safe to re-run.
        if (file.useCaseMetadata?.skipDataSourceIndexing) {
          totalSkipped++;
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
          },
          execute
            ? "Purging offloaded tool output file"
            : "[dry-run] Would purge offloaded tool output file"
        );

        if (!execute) {
          return;
        }

        // Resolve the conversation data source so we can delete the document from Qdrant.
        const dsRes = await getOrCreateConversationDataSourceFromFile(
          auth,
          file
        );
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
          });
          fs.writeSync(manifestFd, entry + "\n");
        }

        totalDeleted++;
      },
      { concurrency: CONCURRENCY }
    );
  }

  localLogger.info(
    {
      execute,
      totalDeleted,
      totalProcessed,
      totalSkipped,
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
  },
  async ({ execute, manifest }, scriptLogger) => {
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
        { concurrency: 1 }
      );
    } finally {
      if (manifestFd !== null) {
        fs.closeSync(manifestFd);
        scriptLogger.info({ manifestPath }, "Manifest written");
      }
    }
  }
);
