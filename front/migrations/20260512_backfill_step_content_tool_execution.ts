import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";
import fs from "fs";

const WORKSPACE_CONCURRENCY = 1;
const BATCH_SIZE = 2000;
const NON_ZERO_ACTIONS_CSV_PATH = "non_zero_actions.csv";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function appendNonZeroActionsCsv(
  workspaceId: string,
  actions: Array<{
    id: number;
    stepContentId: number;
    agentMessageId: number;
    version: number;
  }>
): void {
  if (actions.length === 0) {
    return;
  }
  const needsHeader =
    !fs.existsSync(NON_ZERO_ACTIONS_CSV_PATH) ||
    fs.statSync(NON_ZERO_ACTIONS_CSV_PATH).size === 0;
  const header =
    "workspace_sId,action_id,step_content_id,agent_message_id,version\n";
  const lines = actions
    .map((a) =>
      [
        csvEscape(workspaceId),
        csvEscape(a.id),
        csvEscape(a.stepContentId),
        csvEscape(a.agentMessageId),
        csvEscape(a.version),
      ].join(",")
    )
    .join("\n");
  fs.appendFileSync(
    NON_ZERO_ACTIONS_CSV_PATH,
    (needsHeader ? header : "") + lines + "\n",
    "utf-8"
  );
}

type Manifest = {
  processed_workspaces: string[];
};

function loadManifest(filePath: string): Manifest {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Manifest;
  }
  return { processed_workspaces: [] };
}

function markWorkspaceDone(
  filePath: string,
  manifest: Manifest,
  workspace: LightWorkspaceType
): void {
  manifest.processed_workspaces.push(workspace.sId);
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), "utf-8");
}

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  {
    execute,
  }: {
    execute: boolean;
  },
  localLogger: Logger
): Promise<void> {
  let cursorId = 0;
  while (true) {
    const actions = await AgentMCPActionModel.findAll({
      attributes: ["id", "stepContentId", "agentMessageId", "version"],
      where: {
        id: { [Op.gt]: cursorId },
        workspaceId: workspace.id,
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (actions.length === 0) {
      break;
    }

    localLogger.info(
      { cursorId, batchSize: actions.length },
      "Processing batch"
    );

    // SIDE-QUEST : While we're looking up the whole actions table, let's
    // check if some of them have a non-0 version. If we don't find any,
    // we'll be able to drop the column.
    //
    // RESULT: zero nonZeroVersionActions found. Removing the column.
    // const nonZeroVersionActions = actions.filter((a) => a.version > 0);
    // appendNonZeroActionsCsv(workspace.sId, nonZeroVersionActions);

    // Retrieve conversation id for agent message to populate table.
    const messages = await MessageModel.findAll({
      attributes: ["agentMessageId", "conversationId"],
      where: {
        workspaceId: workspace.id,
        agentMessageId: { [Op.in]: actions.map((a) => a.agentMessageId) },
      },
    });

    const messagesMap = new Map();
    messages.forEach((m) =>
      messagesMap.set(m.agentMessageId, m.conversationId)
    );

    // Check conversations have been found.
    const validActions = actions.filter((a) =>
      messagesMap.has(a.agentMessageId)
    );
    if (validActions.length < actions.length) {
      localLogger.warn(
        { skipped: actions.length - validActions.length },
        "Some actions have no matching message, skipping."
      );
    }

    if (execute) {
      await AgentStepContentToolExecutionModel.bulkCreate(
        validActions.map((a) => ({
          workspaceId: workspace.id,
          agentMCPActionId: a.id,
          agentMessageId: a.agentMessageId,
          conversationId: messagesMap.get(a.agentMessageId),
        })),
        {
          ignoreDuplicates: true,
        }
      );
    }

    cursorId = actions[actions.length - 1].id;
  }
}

makeScript(
  {
    concurrency: {
      type: "number",
      default: WORKSPACE_CONCURRENCY,
      describe: "Number of concurrent workspaces processed",
    },
    manifestPath: {
      type: "string",
      default: "step_content_backfill_manifest.json",
      describe: "Path to the list of already processed workspaces.",
    },
    workspaceId: {
      type: "string",
      required: false,
      describe:
        "Run on a single workspace (sId); omit to run on all workspaces",
    },
  },
  async ({ concurrency, manifestPath, execute, workspaceId }, scriptLogger) => {
    const manifest = loadManifest(manifestPath);
    const processed = new Set(manifest.processed_workspaces);

    try {
      await runOnAllWorkspaces(
        async (workspace) => {
          // Avoid re-backfilling an already backfilled workspace.
          // Would be a no-op because of ignoreDuplicates, but wastes time & compute.
          if (processed.has(workspace.sId)) {
            scriptLogger.info(
              { wId: workspace.sId },
              "Already processed, skipping."
            );
            return;
          }

          await backfillWorkspace(
            workspace,
            { execute },
            scriptLogger.child({ workspaceId: workspace.sId })
          );
          scriptLogger.info(
            { execute, workspaceId: workspace.sId },
            "Done processing workspace"
          );

          markWorkspaceDone(manifestPath, manifest, workspace);
        },
        { concurrency, wId: workspaceId }
      );
    } catch {
      scriptLogger.info(
        {},
        "Uncaught error in the backfill. Retry from the manifest."
      );
    }
  }
);
