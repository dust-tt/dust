import * as fs from "fs";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { WebhookSourceModel } from "@app/lib/models/agent/triggers/webhook_source";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types/core/core_api";
import type { LightWorkspaceType } from "@app/types/user";

const WebhookSourceModelWithBypass: ModelStaticWorkspaceAware<WebhookSourceModel> =
  WebhookSourceModel;

const BATCH_SIZE = 500;
const CONCURRENCY = 20;
const WORKSPACE_CONCURRENCY = 20;

/**
 * Purges webhook payload files (`webhook_body_<sourceId>_<epoch>.json`) from Qdrant and stamps
 * them with `skipDataSourceIndexing` so future conversation renders no longer advertise them
 * as searchable.
 *
 * These files are created by `launchTriggersWorkflows` in
 * `front/temporal/triggers/webhook_client.ts` whenever a trigger has `includePayload: true`,
 * then attached as a content fragment to a conversation (where `useCaseMetadata.conversationId`
 * gets set and the file is upserted into the conversation data source — see
 * `front/lib/api/files/attachments.ts`). They are almost never useful to embed and inflate
 * indexed points; at the same time, the source `FileResource` is preserved so users can still
 * download the raw JSON from the conversation.
 *
 * Safe to re-run: files already stamped with `skipDataSourceIndexing` are skipped.
 *
 * Re-indexing: when `--execute` is set, each deleted document is appended as an NDJSON line to
 * the manifest file (`--manifest`, defaults to
 * `purge_webhook_body_manifest_<timestamp>.ndjson` in cwd). Each line contains everything
 * needed to restore the document to Qdrant if required.
 */

// Created in webhook_client.ts as:
//   `webhook_body_${webhookSource.id}_${Date.now()}.json`
const WEBHOOK_BODY_LIKE = "webhook_body_%.json";
const WEBHOOK_BODY_RE = /^webhook_body_\d+_\d+\.json$/;

async function purgeWorkspace(
  workspace: LightWorkspaceType,
  { execute, manifestFd }: { execute: boolean; manifestFd: number | null },
  localLogger: Logger
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  let cursorId = 0;
  let totalProcessed = 0;
  let totalDeleted = 0;
  let totalSkipped = 0;

  while (true) {
    const candidates = await FileModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: workspace.id,
        useCase: "conversation",
        contentType: "application/json",
        fileName: { [Op.like]: WEBHOOK_BODY_LIKE },
        id: { [Op.gt]: cursorId },
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (candidates.length === 0) {
      break;
    }

    cursorId = candidates[candidates.length - 1].id;

    const fileResources = await FileResource.fetchByModelIdsWithAuth(
      auth,
      candidates.map((f) => f.id)
    );

    // Defensive: the SQL LIKE would match `webhook_body_x.json`; require the exact shape
    // produced by `webhook_client.ts`.
    const files = fileResources.filter((f) => WEBHOOK_BODY_RE.test(f.fileName));

    totalProcessed += files.length;

    await concurrentExecutor(
      files,
      async (file) => {
        if (file.useCaseMetadata?.skipDataSourceIndexing) {
          totalSkipped++;
          return;
        }

        localLogger.info(
          {
            fileId: file.sId,
            fileName: file.fileName,
            workspaceId: workspace.sId,
            conversationId: file.useCaseMetadata?.conversationId,
            createdAt: file.createdAt,
          },
          execute
            ? "Purging webhook payload file"
            : "[dry-run] Would purge webhook payload file"
        );

        if (!execute) {
          return;
        }

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
        "Path to the NDJSON manifest file for deleted documents (defaults to purge_webhook_body_manifest_<timestamp>.ndjson in cwd)",
    },
    concurrency: {
      type: "number",
      default: WORKSPACE_CONCURRENCY,
      describe: "Number of concurrent workspaces processed",
    },
  },
  async ({ concurrency, execute, manifest }, scriptLogger) => {
    // Distinct workspaceIds that have at least one webhook source. A workspace whose
    // sole webhook source was deleted would be missed, but webhook payload files from
    // such orphaned sources are rare and not worth scanning every workspace for.
    const rows = await WebhookSourceModelWithBypass.findAll({
      attributes: ["workspaceId"],
      group: ["workspaceId"],
      raw: true,
      // WORKSPACE_ISOLATION_BYPASS: Migration script needs to enumerate every workspace
      // that has a webhook source so we can target only those for the file scan.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    const workspaceModelIds = rows.map((r) => r.workspaceId);
    const workspaces =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);
    const targets: LightWorkspaceType[] = workspaces.map((w) =>
      renderLightWorkspaceType({ workspace: w })
    );

    scriptLogger.info(
      { workspaceCount: targets.length },
      "Workspaces with webhook sources"
    );

    let manifestPath: string | null = null;
    let manifestFd: number | null = null;

    if (execute) {
      manifestPath =
        manifest ||
        `purge_webhook_body_manifest_${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`;
      manifestFd = fs.openSync(manifestPath, "a");
      scriptLogger.info(
        { manifestPath },
        "Writing deleted documents to manifest"
      );
    }

    try {
      await concurrentExecutor(
        targets,
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
