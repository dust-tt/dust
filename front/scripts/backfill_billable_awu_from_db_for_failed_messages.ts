import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

// Pass 2 of the `cost.billable_awu` backfill (pass 1 is the ES-internal
// `20260729_backfill_billable_awu_...http`, which sets billable_awu = full_awu
// for tracked statuses and 0 for `failed`). This pass recovers the billable
// portion of `failed` messages: a message that ended `failed` but did real work
// in a non-error execution (interrupt/resume) has a DB `costCredits` that already
// excludes the errored terminal execution and is ceiled per execution — the exact
// billable amount. We copy that into `cost.billable_awu`.
//
// Runs per workspace (runOnAllWorkspaces); every DB query is scoped by
// `workspaceId` (indexed), so there is no unbounded cross-workspace scan. Within a
// workspace, the failed-with-costCredits set is small, and we update only those ES
// docs. Failed messages with no/zero `costCredits` keep the 0 pass 1 wrote — no
// regression.

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<{ updated: number; missingInEs: number }> {
  // Scoped to this workspace (workspaceId is indexed): the failed multi-execution
  // messages whose billed amount (costCredits) must land in ES `billable_awu`.
  const agentMessages = await AgentMessageModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "failed",
      costCredits: { [Op.gt]: 0 },
    },
    attributes: ["id", "costCredits"],
  });
  if (agentMessages.length === 0) {
    return { updated: 0, missingInEs: 0 };
  }

  const costByAgentMessageModelId = new Map(
    agentMessages.map((am) => [am.id, am.costCredits])
  );

  // The ES doc id uses the Message sId/version; fetch the Message rows pointing at
  // these AgentMessages (also scoped by workspaceId).
  const messages = await MessageModel.findAll({
    where: {
      workspaceId: workspace.id,
      agentMessageId: agentMessages.map((am) => am.id),
    },
    attributes: ["sId", "version", "agentMessageId"],
  });

  const bulkOps: object[] = [];
  for (const message of messages) {
    const costCredits = message.agentMessageId
      ? costByAgentMessageModelId.get(message.agentMessageId)
      : undefined;
    if (costCredits == null) {
      continue;
    }
    const docId = `${workspace.sId}_${message.sId}_${message.version}`;
    bulkOps.push(
      { update: { _id: docId, _index: ANALYTICS_ALIAS_NAME } },
      { doc: { cost: { billable_awu: costCredits } } }
    );
  }

  const candidates = bulkOps.length / 2;
  if (candidates === 0) {
    return { updated: 0, missingInEs: 0 };
  }

  if (!execute) {
    logger.info(
      { workspaceId: workspace.sId, wouldUpdate: candidates },
      "[DRY RUN] would set billable_awu for failed messages"
    );
    return { updated: candidates, missingInEs: 0 };
  }

  const bulkRes = await withEs(async (client) =>
    client.bulk({ operations: bulkOps, refresh: false })
  );
  if (bulkRes.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, err: bulkRes.error },
      "ES bulk update failed."
    );
    return { updated: 0, missingInEs: 0 };
  }

  // A message may have no analytics doc (never indexed); tolerate 404
  // (document_missing) per item but log anything else.
  let updated = 0;
  let missingInEs = 0;
  if (bulkRes.value.errors) {
    for (const item of bulkRes.value.items ?? []) {
      const status = item.update?.status;
      if (status === undefined || status < 300) {
        updated += 1;
      } else if (status === 404) {
        missingInEs += 1;
      } else {
        logger.error(
          { workspaceId: workspace.sId, item: item.update },
          "ES bulk update item failed (non-404)."
        );
      }
    }
  } else {
    updated = candidates;
  }

  logger.info(
    { workspaceId: workspace.sId, updated, missingInEs },
    "Set billable_awu for failed messages"
  );
  return { updated, missingInEs };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      required: false,
      description: "Single workspace sId to process (all if omitted).",
    },
    fromWorkspaceId: {
      type: "number",
      required: false,
      description: "Resume from this workspace model id.",
    },
    concurrency: { type: "number", default: 8 },
  },
  async ({ workspaceId, fromWorkspaceId, concurrency, execute }, logger) => {
    let totalUpdated = 0;
    let totalMissingInEs = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const { updated, missingInEs } = await backfillWorkspace(
          workspace,
          execute,
          logger
        );
        totalUpdated += updated;
        totalMissingInEs += missingInEs;
      },
      { concurrency, wId: workspaceId, fromWorkspaceId }
    );

    logger.info(
      { totalUpdated, totalMissingInEs, execute },
      execute
        ? "Backfill complete."
        : "Dry run complete (use --execute to apply)."
    );
  }
);
