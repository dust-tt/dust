import { frontSequelize } from "@app/lib/resources/storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_BATCH_DELAY_MS = 100;

// Delete the deprecated "skill_editors" groups. Skill editors are per-user `editor` grants in
// group_permissions (held by one regular_auto group per skill), and the code no longer creates,
// reads or writes these groups, so they are dead rows. Their children must go first: the
// group_permissions and group_memberships foreign keys are ON DELETE RESTRICT.
//
// Idempotent — only rows still attached to a skill_editors group are touched, so it is safe to
// re-run. Runs post-deploy, before the PR that removes the "skill_editors" kind.
const SELECT_GROUPS_SQL = `
  SELECT id
  FROM groups
  WHERE id > :lastId
    AND kind = 'skill_editors'
  ORDER BY id ASC
  LIMIT :batchSize
`;

// Children of the groups being deleted, in FK order.
const DELETE_STATEMENTS = [
  {
    label: "group_permissions",
    sql: `DELETE FROM group_permissions WHERE "groupId" IN (:ids)`,
  },
  {
    label: "group_memberships",
    sql: `DELETE FROM group_memberships WHERE "groupId" IN (:ids)`,
  },
  {
    label: "group_skills",
    sql: `DELETE FROM group_skills WHERE "groupId" IN (:ids)`,
  },
  {
    label: "groups",
    sql: `DELETE FROM groups WHERE id IN (:ids) AND kind = 'skill_editors'`,
  },
];

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function deleteSkillEditorsGroups(
  {
    batchSize,
    batchDelayMs,
  }: {
    batchSize: number;
    batchDelayMs: number;
  },
  logger: Logger
): Promise<void> {
  let batch = 0;
  let lastId = 0;
  let totalDeleted = 0;

  for (;;) {
    // Keyset pagination prevents each batch from rescanning rows already processed. Deleted groups
    // no longer match the select, but keeping the cursor makes each pass strictly forward.
    const rows = await frontSequelize.query<{ id: number }>(SELECT_GROUPS_SQL, {
      replacements: { lastId, batchSize },
      type: QueryTypes.SELECT,
    });

    if (rows.length === 0) {
      break;
    }

    lastId = rows[rows.length - 1].id;
    const ids = rows.map(({ id }) => id);

    // One transaction per batch: a group and its children are never left half-deleted, and row
    // locks are released before the pause.
    const deletedByTable = await frontSequelize.transaction(
      async (transaction) => {
        const counts: Record<string, number> = {};
        for (const { label, sql } of DELETE_STATEMENTS) {
          // RETURNING + SELECT: QueryTypes.DELETE yields no count.
          const deleted = await frontSequelize.query<{ id: number }>(
            `${sql} RETURNING id`,
            {
              replacements: { ids },
              type: QueryTypes.SELECT,
              transaction,
            }
          );
          counts[label] = deleted.length;
        }

        return counts;
      }
    );

    batch += 1;
    totalDeleted += deletedByTable.groups ?? 0;
    logger.info(
      { batch, batchSize: rows.length, lastId, deletedByTable, totalDeleted },
      "Deleted skill_editors groups batch"
    );

    if (batchDelayMs > 0) {
      await wait(batchDelayMs);
    }
  }

  logger.info(
    { batches: batch, lastId, totalDeleted },
    "Completed skill_editors groups deletion"
  );
}

makeScript(
  {
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      describe: "Maximum number of groups deleted per transaction",
    },
    batchDelayMs: {
      type: "number",
      default: DEFAULT_BATCH_DELAY_MS,
      describe: "Delay between delete batches in milliseconds",
    },
  },
  async ({ execute, batchSize, batchDelayMs }, logger) => {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("batchSize must be a positive integer");
    }
    if (!Number.isInteger(batchDelayMs) || batchDelayMs < 0) {
      throw new Error("batchDelayMs must be a non-negative integer");
    }

    if (!execute) {
      const [{ count: groupsCount }] = await frontSequelize.query<{
        count: string;
      }>(`SELECT COUNT(*) AS count FROM groups WHERE kind = 'skill_editors'`, {
        type: QueryTypes.SELECT,
      });
      const [{ count: membershipsCount }] = await frontSequelize.query<{
        count: string;
      }>(
        `SELECT COUNT(*) AS count
           FROM group_memberships gm
           JOIN groups g ON g.id = gm."groupId"
          WHERE g.kind = 'skill_editors'`,
        { type: QueryTypes.SELECT }
      );
      const [{ count: grantsCount }] = await frontSequelize.query<{
        count: string;
      }>(
        `SELECT COUNT(*) AS count
           FROM group_permissions gp
           JOIN groups g ON g.id = gp."groupId"
          WHERE g.kind = 'skill_editors'`,
        { type: QueryTypes.SELECT }
      );

      logger.info(
        {
          groups: Number(groupsCount),
          memberships: Number(membershipsCount),
          grants: Number(grantsCount),
        },
        "Dry-run: would delete the skill_editors groups and their rows"
      );
      return;
    }

    await deleteSkillEditorsGroups({ batchSize, batchDelayMs }, logger);
  }
);
