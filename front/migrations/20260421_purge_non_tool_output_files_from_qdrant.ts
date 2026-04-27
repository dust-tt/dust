import * as fs from "fs";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { CoreAPI } from "@app/types/core/core_api";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

const BATCH_SIZE = 500;
const CONCURRENCY = 20;
const WORKSPACE_CONCURRENCY = 20;

/**
 * Purges files that should not be in Qdrant and stamps them with `skipDataSourceIndexing`
 * so future conversation renders no longer advertise them as searchable. The source
 * `FileResource` is preserved in all cases — only the index side is cleaned.
 *
 * Six classes covered:
 *
 * 1. `webhook_body`: `webhook_body_<sourceId>_<epoch>.json` from
 *    `launchTriggersWorkflows` in `front/temporal/triggers/webhook_client.ts`.
 * 2. `pasted_text`: input-bar pasted attachments, mime
 *    `text/vnd.dust.attachment.pasted`.
 * 3. `slack_thread`: connector attachments, mime
 *    `text/vnd.dust.attachment.slack.thread`. Biggest single bleeder by volume.
 * 4. `chrome_text`: Chrome-extension page-capture attachments, fileName starts with
 *    `"[text] "`. Created by `extension/ui/hooks/useFileUploaderService.ts`.
 * 5. `voice_audio`: audio content fragments, mime `audio/webm`. Bug: binary audio bytes
 *    are read as UTF-8 and embedded into Qdrant (`lib/api/files/utils.ts:getFileContent`),
 *    producing garbage vectors. Scoped to `audio/webm` — the only audio mime observed in
 *    the conversation DS sample (100% of voice files). Easy to broaden later if needed.
 * 6. `tool_output_section`: tool-output files with mime
 *    `application/vnd.dust.section.json`. New writes are already stamped with
 *    `skipDataSourceIndexing: true` at `lib/actions/action_file_helpers.ts`, but pre-flag
 *    rows remain in Qdrant — this cleans up that backlog.
 * 7. `browse_url_text`: tool-output `text/plain` files written by the web_search_&_browse
 *    summarization path (`lib/api/actions/servers/web_search_browse/tools/index.ts`),
 *    where `fileName` is the page URL. When the agent browsed a binary URL (e.g. a JPG)
 *    the scraper's response body was the raw bytes — we wrote them as text/plain and
 *    indexed them into Qdrant as garbage vectors. New writes are stamped with
 *    `skipDataSourceIndexing: true` since #24637, but pre-flag rows persist. The 20250415
 *    purge can't see them: it iterates AgentMCPActionOutputItem rows, and for these files
 *    no matching output item exists.
 *
 * All classes share the same end state: the file record stays around (users can still
 * download it / the model can still read it inline), but it's no longer indexed for
 * retrieval. Most are same-turn context that the agent reads once and never searches.
 *
 * Implementation notes — we don't have indexes on `contentType` / `fileName` / `useCase`,
 * so filtering those fields in SQL would force a per-workspace scan per filter. Instead we
 * paginate the workspace's `FileModel` rows using the `(workspaceId, id)` composite index
 * and classify each row client-side. Single bulk scan per workspace, no repeated DB
 * hammering.
 *
 * Safe to re-run: files already stamped with `skipDataSourceIndexing` are skipped.
 *
 * Re-indexing: when `--execute` is set, each deleted document is appended as an NDJSON line
 * to the manifest file (`--manifest`, defaults to `purge_manifest_<timestamp>.ndjson` in
 * cwd). Each line carries a `reason` field (one of the six above) so subsets can be
 * re-indexed if needed.
 */

// Created in webhook_client.ts as:
//   `webhook_body_${webhookSource.id}_${Date.now()}.json`
const WEBHOOK_BODY_RE = /^webhook_body_\d+_\d+\.json$/;

// Content type emitted by the paste handler (see
// front/components/assistant/conversation/input_bar/pasted_utils.ts).
const PASTED_CONTENT_TYPE = "text/vnd.dust.attachment.pasted";

// Content type for Slack thread attachments pulled in by the Slack connector.
const SLACK_THREAD_CONTENT_TYPE = "text/vnd.dust.attachment.slack.thread";

// Content type for tool-output section files created at
// lib/actions/action_file_helpers.ts. Only emitter in the codebase.
const SECTION_JSON_CONTENT_TYPE = "application/vnd.dust.section.json";

// Chrome extension page-capture filenames (extension/ui/hooks/useFileUploaderService.ts).
const CHROME_TEXT_PREFIX = "[text] ";

// Browse-summarization files: fileName is the page URL or http(s) URL of a binary asset.
const BROWSE_URL_RE = /^https?:\/\//i;

type PurgeReason =
  | "webhook_body"
  | "pasted_text"
  | "slack_thread"
  | "chrome_text"
  | "voice_audio"
  | "tool_output_section"
  | "browse_url_text";

type PurgeStats = {
  totalProcessed: number;
  totalDeleted: number;
  totalSkipped: number;
};

function classify(row: {
  useCase: string;
  contentType: string;
  fileName: string;
}): PurgeReason | null {
  if (row.useCase === "conversation") {
    if (
      row.contentType === "application/json" &&
      WEBHOOK_BODY_RE.test(row.fileName)
    ) {
      return "webhook_body";
    }
    if (row.contentType === PASTED_CONTENT_TYPE) {
      return "pasted_text";
    }
    if (row.contentType === SLACK_THREAD_CONTENT_TYPE) {
      return "slack_thread";
    }
    if (row.fileName.startsWith(CHROME_TEXT_PREFIX)) {
      return "chrome_text";
    }
    if (row.contentType === "audio/webm") {
      return "voice_audio";
    }
  }
  if (row.useCase === "tool_output") {
    if (row.contentType === SECTION_JSON_CONTENT_TYPE) {
      return "tool_output_section";
    }
    if (
      row.contentType === "text/plain" &&
      BROWSE_URL_RE.test(row.fileName)
    ) {
      return "browse_url_text";
    }
  }
  return null;
}

async function purgeFile(
  auth: Authenticator,
  coreAPI: CoreAPI,
  file: FileResource,
  workspace: LightWorkspaceType,
  {
    execute,
    manifestFd,
    reason,
  }: { execute: boolean; manifestFd: number | null; reason: PurgeReason },
  localLogger: Logger,
  stats: PurgeStats
): Promise<void> {
  if (file.useCaseMetadata?.skipDataSourceIndexing) {
    stats.totalSkipped++;
    return;
  }

  localLogger.info(
    {
      fileId: file.sId,
      fileName: file.fileName,
      contentType: file.contentType,
      workspaceId: workspace.sId,
      conversationId: file.useCaseMetadata?.conversationId,
      createdAt: file.createdAt,
      reason,
    },
    execute ? "Purging file" : "[dry-run] Would purge file"
  );

  if (!execute) {
    return;
  }

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
      reason,
    });
    fs.writeSync(manifestFd, entry + "\n");
  }

  stats.totalDeleted++;
}

async function purgeWorkspace(
  workspace: LightWorkspaceType,
  { execute, manifestFd }: { execute: boolean; manifestFd: number | null },
  localLogger: Logger
): Promise<PurgeStats> {
  const stats: PurgeStats = {
    totalProcessed: 0,
    totalDeleted: 0,
    totalSkipped: 0,
  };

  // Authenticator init fetches OAuth credentials if BYOK is available on the plan via the
  // OAuth service. Prodbox can't reach oauth. Simply skip the workspace.
  let auth: Authenticator;
  try {
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  } catch (err) {
    localLogger.error(
      { workspaceId: workspace.sId, error: normalizeError(err) },
      "Failed to initialize authenticator (OAuth service unavailable?), skipping workspace"
    );
    return stats;
  }
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  let cursorId = 0;

  while (true) {
    // Cursor pagination on the (workspaceId, id) composite index, no other predicates so
    // we don't hit unindexed columns. Classification happens in JS below.
    const rows = await FileModel.findAll({
      attributes: ["id", "fileName", "contentType", "useCase"],
      where: {
        workspaceId: workspace.id,
        id: { [Op.gt]: cursorId },
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (rows.length === 0) {
      break;
    }

    cursorId = rows[rows.length - 1].id;

    const targets: Array<{ id: number; reason: PurgeReason }> = [];
    for (const r of rows) {
      const reason = classify(r);
      if (reason !== null) {
        targets.push({ id: r.id, reason });
      }
    }

    if (targets.length === 0) {
      continue;
    }

    const fileResources = await FileResource.fetchByModelIdsWithAuth(
      auth,
      targets.map((t) => t.id)
    );
    const fileById = new Map(fileResources.map((f) => [f.id, f]));

    stats.totalProcessed += targets.length;

    await concurrentExecutor(
      targets,
      async ({ id, reason }) => {
        const file = fileById.get(id);
        if (!file) {
          return;
        }
        await purgeFile(
          auth,
          coreAPI,
          file,
          workspace,
          { execute, manifestFd, reason },
          localLogger,
          stats
        );
      },
      { concurrency: CONCURRENCY }
    );
  }

  return stats;
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
      describe: "Number of concurrent workspaces processed",
    },
    workspaceId: {
      type: "string",
      required: false,
      describe:
        "Run on a single workspace (sId); omit to run on all workspaces",
    },
  },
  async ({ concurrency, execute, manifest, workspaceId }, scriptLogger) => {
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
          const stats = await purgeWorkspace(
            workspace,
            { execute, manifestFd },
            scriptLogger.child({ workspaceId: workspace.sId })
          );
          scriptLogger.info(
            { execute, workspaceId: workspace.sId, ...stats },
            "Done processing workspace"
          );
        },
        { concurrency, wId: workspaceId }
      );
    } finally {
      if (manifestFd !== null) {
        fs.closeSync(manifestFd);
        scriptLogger.info({ manifestPath }, "Manifest written");
      }
    }
  }
);
