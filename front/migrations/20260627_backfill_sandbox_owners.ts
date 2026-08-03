import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

type CountRow = { count: number };

async function countRows(sql: string): Promise<number> {
  const [{ count }] = await frontSequelize.query<CountRow>(sql, {
    type: QueryTypes.SELECT,
  });
  return count;
}

async function countMissingSandboxOwners(): Promise<number> {
  return countRows(`
    SELECT COUNT(*)::int AS "count"
    FROM "conversation_sandboxes" cs
    WHERE NOT EXISTS (
      SELECT 1 FROM "sandbox_owners" so
      WHERE so."workspaceId" = cs."workspaceId"
        AND so."conversationId" = cs."conversationId"
        AND so."sandboxId" = cs."sandboxId"
    )
  `);
}

async function countExtraSandboxOwners(): Promise<number> {
  return countRows(`
    SELECT COUNT(*)::int AS "count"
    FROM "sandbox_owners" so
    WHERE so."conversationId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "conversation_sandboxes" cs
        WHERE cs."workspaceId" = so."workspaceId"
          AND cs."conversationId" = so."conversationId"
          AND cs."sandboxId" = so."sandboxId"
      )
  `);
}

makeScript({}, async ({ execute }, logger) => {
  const missingBefore = await countMissingSandboxOwners();
  const extraBefore = await countExtraSandboxOwners();

  logger.info({ missingBefore, extraBefore }, "Checked sandbox owner drift");

  if (execute) {
    await countRows(`
      WITH inserted AS (
        INSERT INTO "sandbox_owners"
          ("createdAt", "updatedAt", "conversationId", "sandboxId", "workspaceId")
        SELECT
          cs."createdAt",
          NOW(),
          cs."conversationId",
          cs."sandboxId",
          cs."workspaceId"
        FROM "conversation_sandboxes" cs
        WHERE NOT EXISTS (
          SELECT 1 FROM "sandbox_owners" so
          WHERE so."workspaceId" = cs."workspaceId"
            AND so."conversationId" = cs."conversationId"
            AND so."sandboxId" = cs."sandboxId"
        )
        ON CONFLICT DO NOTHING RETURNING 1
      )
      SELECT COUNT(*)::int AS "count" FROM inserted
    `);
  }

  const missingAfter = await countMissingSandboxOwners();
  const extraAfter = await countExtraSandboxOwners();

  if (execute && (missingAfter > 0 || extraAfter > 0)) {
    throw new Error(
      `sandbox_owners is not ISO with conversation_sandboxes: missing=${missingAfter} extra=${extraAfter}`
    );
  }
});
