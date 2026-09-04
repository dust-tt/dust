import { QueryTypes } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

const DEFAULT_SEED_BATCH_SIZE = 1_000;
const DEFAULT_BATCH_DELAY_MS = 100;
const PARENT_CONCURRENCY = 4;
const WORKSPACE_CONCURRENCY = 2;

// Backfill `agent_messages.totalCostCredits` (a message's own cost plus the cost of every run_agent
// sub-agent it spawned) for messages finalized before the column existed. Two per-workspace steps:
//   1. Roll up every run_agent parent: total = own costCredits + recursive sub-agent cost sum.
//   2. Seed the remaining messages (leaves / non-parents) to total = costCredits.
//
// Step 1 reuses ConversationResource.sumSubAgentCostCreditsByMessageId, which sums the whole subtree
// in one query and is therefore order-independent (no need to process children before parents). The
// recursive query is fine here — this is a one-time, throttled batch over the small set of run_agent
// parents, not the finalize hot path. It matches finalize exactly: the recursive sum of descendants'
// own costs equals finalize's sum of the direct sub-agents' (already-rolled-up) totals.
//
// Both steps skip rows whose total is already set, so values written by the finalize path are never
// clobbered and the script is safe to re-run.

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function rollupRunAgentParents(
  auth: Authenticator,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();
  const workspaceId = workspace.id;

  // Distinct parent agent-message sIds: the messages.sId that run_agent sub-agents point back at.
  const parents = await frontSequelize.query<{ agentMessageId: string }>(
    `SELECT DISTINCT "agenticOriginMessageId" AS "agentMessageId"
     FROM user_messages
     WHERE "workspaceId" = :workspaceId
       AND "agenticMessageType" = 'run_agent'
       AND "agenticOriginMessageId" IS NOT NULL`,
    { type: QueryTypes.SELECT, replacements: { workspaceId } }
  );

  if (parents.length === 0) {
    return;
  }

  await concurrentExecutor(
    parents,
    async ({ agentMessageId }) => {
      const subAgentCostCredits =
        await ConversationResource.sumSubAgentCostCreditsByMessageId(auth, {
          agentMessageId,
        });

      if (!execute) {
        logger.info(
          { workspaceId: workspace.sId, agentMessageId, subAgentCostCredits },
          "Dry-run: would roll up run_agent parent totalCostCredits"
        );
        return;
      }

      // total = own cost + sub-agent cost; null only when the message has neither.
      await frontSequelize.query(
        `UPDATE agent_messages am
         SET "totalCostCredits" =
           CASE
             WHEN am."costCredits" IS NULL AND :subAgentCostCredits = 0 THEN NULL
             ELSE COALESCE(am."costCredits", 0) + :subAgentCostCredits
           END
         FROM messages m
         WHERE m."agentMessageId" = am.id
           AND m."sId" = :agentMessageId
           AND m."workspaceId" = :workspaceId
           AND am."workspaceId" = :workspaceId`,
        {
          type: QueryTypes.UPDATE,
          replacements: { subAgentCostCredits, agentMessageId, workspaceId },
        }
      );
    },
    { concurrency: PARENT_CONCURRENCY }
  );

  logger.info(
    { workspaceId: workspace.sId, parentCount: parents.length, execute },
    "Rolled up run_agent parent totalCostCredits"
  );
}

async function seedLeafTotals(
  auth: Authenticator,
  {
    execute,
    batchSize,
    batchDelayMs,
    logger,
  }: {
    execute: boolean;
    batchSize: number;
    batchDelayMs: number;
    logger: Logger;
  }
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();
  const workspaceId = workspace.id;

  let lastId = 0;
  let totalSeeded = 0;

  for (;;) {
    // Keyset pagination over rows still missing a total. Parents rolled up in step 1 are already
    // non-null and skipped; only leaves / non-run_agent messages remain (total = own cost).
    const rows = await frontSequelize.query<{ id: number }>(
      `SELECT id
       FROM agent_messages
       WHERE "workspaceId" = :workspaceId
         AND id > :lastId
         AND "totalCostCredits" IS NULL
         AND "costCredits" IS NOT NULL
       ORDER BY id ASC
       LIMIT :batchSize`,
      {
        type: QueryTypes.SELECT,
        replacements: { workspaceId, lastId, batchSize },
      }
    );

    if (rows.length === 0) {
      break;
    }

    lastId = rows[rows.length - 1].id;

    if (execute) {
      const [, seeded] = await frontSequelize.query(
        `UPDATE agent_messages
         SET "totalCostCredits" = "costCredits"
         WHERE id IN (:ids)
           AND "workspaceId" = :workspaceId
           AND "totalCostCredits" IS NULL`,
        {
          type: QueryTypes.UPDATE,
          replacements: { ids: rows.map(({ id }) => id), workspaceId },
        }
      );
      totalSeeded += seeded;
    } else {
      totalSeeded += rows.length;
    }

    if (batchDelayMs > 0) {
      await wait(batchDelayMs);
    }
  }

  if (totalSeeded > 0) {
    logger.info(
      { workspaceId: workspace.sId, totalSeeded, execute },
      "Seeded leaf totalCostCredits"
    );
  }
}

makeScript(
  {
    wId: {
      type: "string",
      required: false,
      describe: "Restrict the backfill to a single workspace sId",
    },
    batchSize: {
      type: "number",
      default: DEFAULT_SEED_BATCH_SIZE,
      describe: "Rows seeded per leaf-seed batch",
    },
    batchDelayMs: {
      type: "number",
      default: DEFAULT_BATCH_DELAY_MS,
      describe: "Delay between leaf-seed batches in milliseconds",
    },
  },
  async ({ execute, wId, batchSize, batchDelayMs }, logger) => {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("batchSize must be a positive integer");
    }
    if (!Number.isInteger(batchDelayMs) || batchDelayMs < 0) {
      throw new Error("batchDelayMs must be a non-negative integer");
    }

    logger.info("Starting agent_messages totalCostCredits backfill");

    await runOnAllWorkspaces(
      async (workspace: LightWorkspaceType) => {
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        // Parents first (absolute, re-run safe), then seed everything still missing a total. Order
        // is not required for correctness — it just avoids seeding a parent to its own cost only to
        // overwrite it moments later.
        await rollupRunAgentParents(auth, { execute, logger });
        await seedLeafTotals(auth, {
          execute,
          batchSize,
          batchDelayMs,
          logger,
        });
      },
      { concurrency: WORKSPACE_CONCURRENCY, wId }
    );

    logger.info("Completed agent_messages totalCostCredits backfill");
  }
);
