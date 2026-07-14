import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

// Forked (branched) conversations used to be created with `depth =
// parent.depth + 1`, which marked them as run_agent sub-conversations and hid
// them from space conversation lists (`depth = 0` filter), notifications, etc.
// Forks now inherit the parent's depth; this backfills existing forks by
// propagating `depth = parent.depth` through the fork lineage. Re-selecting
// mismatched rows after each batch naturally propagates depth down
// fork-of-fork chains until a fixpoint is reached.
//
// Raw SQL bypasses Sequelize hooks on purpose: `updatedAt` must stay untouched
// so backfilled conversations keep their position in updatedAt-ordered lists.

const MISMATCH_CONDITION = `
  FROM conversation_forks f
  JOIN conversations p
    ON p.id = f."parentConversationId"
   AND p."workspaceId" = f."workspaceId"
  WHERE c.id = f."childConversationId"
    AND c."workspaceId" = f."workspaceId"
    AND c.depth <> p.depth
`;

// Keeps each UPDATE's row-lock footprint small on the hot conversations table.
const BATCH_SIZE = 1_000;
// Bounds the loop; covers BATCH_SIZE * MAX_BATCHES rows plus chain propagation.
const MAX_BATCHES = 10_000;

makeScript({}, async ({ execute }, logger) => {
  if (!execute) {
    const [{ count }] = await frontSequelize.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM conversations c ${MISMATCH_CONDITION}`,
      { type: QueryTypes.SELECT }
    );
    logger.info(
      { mismatched: Number(count) },
      "Would align forked conversation depths with their parents (first level; fork chains may add more)"
    );
    return;
  }

  let totalUpdated = 0;
  let reachedFixpoint = false;
  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    const rows = await frontSequelize.query<{ id: number }>(
      `SELECT c.id FROM conversations c ${MISMATCH_CONDITION} LIMIT ${BATCH_SIZE}`,
      { type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      reachedFixpoint = true;
      break;
    }

    const [, updated] = await frontSequelize.query(
      `UPDATE conversations c SET depth = p.depth ${MISMATCH_CONDITION} AND c.id IN (:ids)`,
      {
        type: QueryTypes.UPDATE,
        replacements: { ids: rows.map((r) => r.id) },
      }
    );
    totalUpdated += updated;
    logger.info({ batch, updated, totalUpdated }, "Fork depth backfill batch");
  }

  if (!reachedFixpoint) {
    logger.warn(
      { totalUpdated, maxBatches: MAX_BATCHES },
      "Fork depth backfill hit the batch cap before reaching a fixpoint; re-run to finish"
    );
    return;
  }

  logger.info({ totalUpdated }, "Completed fork conversation depth backfill");
});
