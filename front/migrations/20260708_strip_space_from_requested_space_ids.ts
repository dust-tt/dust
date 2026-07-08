import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

// Every table that carries a `requestedSpaceIds` bigint[] column. `skill_versions`
// inherits the column from `SkillConfigurationModel` via SKILL_MODEL_ATTRIBUTES, so
// it must be included alongside `skill_configurations`.
const TABLES = [
  "agent_configurations",
  "skill_configurations",
  "skill_versions",
] as const;

type CountRow = { count: string };

// True when the row's requestedSpaceIds overlaps the target spaces, i.e. it still
// references at least one of them.
function referencesTargetSpaces(spaceIdsLiteral: string): string {
  return `"requestedSpaceIds" && ${spaceIdsLiteral}`;
}

// The requestedSpaceIds array rebuilt with the target spaces removed, keeping the
// remaining ids in their original order.
function requestedSpaceIdsWithoutTargets(spaceIdsLiteral: string): string {
  return `ARRAY(
    SELECT id
    FROM unnest("requestedSpaceIds") AS id
    WHERE id <> ALL (${spaceIdsLiteral})
  )`;
}

async function stripFromTable(
  table: string,
  spaceIdsLiteral: string,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const [{ count }] = await frontSequelize.query<CountRow>(
    `SELECT COUNT(*) AS count
     FROM "${table}"
     WHERE ${referencesTargetSpaces(spaceIdsLiteral)}`,
    { type: QueryTypes.SELECT }
  );
  const affected = Number(count);

  if (affected === 0) {
    logger.info({ table }, "No rows reference the target spaces, skipping");
    return;
  }

  if (!execute) {
    logger.info(
      { table, affected },
      "Would strip target spaces from requestedSpaceIds"
    );
    return;
  }

  await frontSequelize.query(
    `UPDATE "${table}"
     SET "requestedSpaceIds" = ${requestedSpaceIdsWithoutTargets(spaceIdsLiteral)}
     WHERE ${referencesTargetSpaces(spaceIdsLiteral)}`,
    { type: QueryTypes.UPDATE }
  );

  logger.info(
    { table, affected },
    "Stripped target spaces from requestedSpaceIds"
  );
}

makeScript(
  {
    spaceIds: {
      type: "array",
      description:
        "Space model ids (numeric) to strip from every requestedSpaceIds column",
      required: true,
    },
  },
  async ({ spaceIds, execute }, logger) => {
    const parsed = spaceIds.map((s) => Number(s));
    if (parsed.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
      logger.error({ spaceIds }, "spaceIds must be positive integers");
      return;
    }

    // Safe integer interpolation (validated above); enables set-based updates
    // without fetching every row.
    const spaceIdsLiteral = `ARRAY[${parsed.join(",")}]::bigint[]`;

    logger.info(
      { spaceIds: parsed, execute },
      "Starting requestedSpaceIds strip"
    );

    for (const table of TABLES) {
      await stripFromTable(table, spaceIdsLiteral, execute, logger);
    }

    logger.info(
      { spaceIds: parsed, execute },
      execute ? "Completed requestedSpaceIds strip" : "Dry run completed"
    );
  }
);
