import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

// Forked (branched) conversations used to be created with `depth =
// parent.depth + 1`, which marked them as run_agent sub-conversations and hid
// them from space conversation lists (`depth = 0` filter), notifications, etc.
// Forks now inherit the parent's depth; this backfills existing forks by
// propagating `depth = parent.depth` through the fork lineage. Each pass
// fixes one level of fork chains, so we loop until a fixpoint is reached.

const MISMATCH_CONDITION = `
  FROM conversation_forks f
  JOIN conversations p
    ON p.id = f."parentConversationId"
   AND p."workspaceId" = f."workspaceId"
  WHERE c.id = f."childConversationId"
    AND c."workspaceId" = f."workspaceId"
    AND c.depth <> p.depth
`;

// Bounds fork-chain propagation; real chains are far shorter.
const MAX_PASSES = 32;

makeScript({}, async ({ execute }, logger) => {
  if (!execute) {
    const [{ count }] = await frontSequelize.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM conversations c ${MISMATCH_CONDITION}`,
      { type: QueryTypes.SELECT }
    );
    logger.info(
      { mismatched: Number(count) },
      "Would align forked conversation depths with their parents (first pass; fork chains may need more)"
    );
    return;
  }

  let totalUpdated = 0;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const [, updated] = await frontSequelize.query(
      `UPDATE conversations c SET depth = p.depth ${MISMATCH_CONDITION}`,
      { type: QueryTypes.UPDATE }
    );
    totalUpdated += updated;
    logger.info({ pass, updated }, "Fork depth backfill pass completed");
    if (updated === 0) {
      break;
    }
  }

  logger.info({ totalUpdated }, "Completed fork conversation depth backfill");
});
