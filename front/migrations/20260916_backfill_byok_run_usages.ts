import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";

// `run_usages."useWorkspaceCredentials"` ships as NOT NULL DEFAULT false, so every historical row
// already reads false — the correct value everywhere except the workspaces that moved to a BYOK
// plan before the write paths started setting the column. Only those need this script:
//
//   npx tsx migrations/20260916_backfill_byok_run_usages.ts \
//     --wId=<workspace sId> --cutoff=<subscription startDate> --execute
//
// The cutoff is the instant the workspace started serving inference with its own credentials, i.e.
// the start of its first subscription to the BYOK plan:
//
//   SELECT s."startDate"
//   FROM subscriptions s
//   JOIN plans p ON p.id = s."planId"
//   JOIN workspaces w ON w.id = s."workspaceId"
//   WHERE w."sId" = '<workspace sId>' AND p.code = '<BYOK plan code>'
//   ORDER BY s."startDate" ASC
//   LIMIT 1;
//
// The table is one of the largest, so the update walks the primary key in id windows: ids are
// monotonic with `createdAt`, so each row in the affected range is read exactly once and the
// script can be resumed from the last logged id.
const DEFAULT_ID_STRIDE = 50_000;
const DEFAULT_BATCH_DELAY_MS = 100;

const UPDATE_WINDOW_SQL = `
  UPDATE run_usages
  SET "useWorkspaceCredentials" = true
  WHERE "workspaceId" = :workspaceId
    AND id >= :fromId
    AND id < :toId
    AND "createdAt" >= :cutoff::timestamptz
    AND NOT "useWorkspaceCredentials"
`;

// PostgreSQL parses the cutoff, so the timestamp can be pasted verbatim from a psql result
// ("2026-04-08 07:51:14.806+00") and the instant it resolved to is echoed back for the log.
const SELECT_RANGE_SQL = `
  SELECT
    :cutoff::timestamptz AS cutoff,
    MIN(id) AS "minId",
    MAX(id) AS "maxId",
    COUNT(*) AS count
  FROM run_usages
  WHERE "workspaceId" = :workspaceId
    AND "createdAt" >= :cutoff::timestamptz
`;

// Without an offset PostgreSQL would resolve the timestamp against the server timezone, silently
// shifting the boundary, so the caller has to spell the offset out.
function assertCutoffHasOffset(cutoff: string): void {
  const hasExplicitOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(cutoff.trim());
  if (hasExplicitOffset) {
    return;
  }

  throw new Error(
    `cutoff must carry an explicit UTC offset, e.g. "2026-04-08 07:51:14.806+00" ` +
      `(got "${cutoff}")`
  );
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      describe: "sId of the workspace whose run usages switched to BYOK",
    },
    cutoff: {
      type: "string",
      demandOption: true,
      describe:
        "Timestamp with offset from which usage was served by workspace credentials",
    },
    idStride: {
      type: "number",
      default: DEFAULT_ID_STRIDE,
      describe: "Number of run usage ids scanned per update statement",
    },
    batchDelayMs: {
      type: "number",
      default: DEFAULT_BATCH_DELAY_MS,
      describe: "Delay between update statements in milliseconds",
    },
  },
  async ({ execute, wId, cutoff, idStride, batchDelayMs }, logger) => {
    assertCutoffHasOffset(cutoff);
    if (!Number.isInteger(idStride) || idStride <= 0) {
      throw new Error("idStride must be a positive integer");
    }
    if (!Number.isInteger(batchDelayMs) || batchDelayMs < 0) {
      throw new Error("batchDelayMs must be a non-negative integer");
    }

    const workspace = await WorkspaceModel.findOne({ where: { sId: wId } });
    if (!workspace) {
      throw new Error(`Workspace ${wId} not found`);
    }

    const replacements = { workspaceId: workspace.id, cutoff };
    const [range] = await frontSequelize.query<{
      cutoff: Date;
      minId: string | null;
      maxId: string | null;
      count: string;
    }>(SELECT_RANGE_SQL, { replacements, type: QueryTypes.SELECT });
    const resolvedCutoff = range.cutoff.toISOString();

    if (!range.minId || !range.maxId) {
      logger.info(
        { wId, cutoff: resolvedCutoff },
        "No run usage to backfill after cutoff"
      );
      return;
    }

    const minId = Number(range.minId);
    const maxId = Number(range.maxId);
    const context = {
      wId,
      workspaceId: workspace.id,
      cutoff: resolvedCutoff,
      minId,
      maxId,
      idStride,
    };

    if (!execute) {
      logger.info(
        { ...context, wouldUpdateCount: Number(range.count) },
        "Dry run: would mark run usages as served by workspace credentials"
      );
      return;
    }

    let totalUpdated = 0;
    for (let fromId = minId; fromId <= maxId; fromId += idStride) {
      const toId = fromId + idStride;
      // One autocommit transaction per window so row locks are released before the pause. Raw SQL
      // also leaves `updatedAt` untouched.
      const [, updated] = await frontSequelize.query(UPDATE_WINDOW_SQL, {
        replacements: { ...replacements, fromId, toId },
        type: QueryTypes.UPDATE,
      });

      totalUpdated += updated;
      logger.info(
        { ...context, fromId, toId, updated, totalUpdated },
        "Backfilled BYOK run usage window"
      );

      if (batchDelayMs > 0) {
        await wait(batchDelayMs);
      }
    }

    logger.info(
      { ...context, totalUpdated },
      "Completed BYOK run usage backfill"
    );
  }
);
