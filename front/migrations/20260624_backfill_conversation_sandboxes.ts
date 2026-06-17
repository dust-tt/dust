import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

type CountRow = { count: number };

async function countRows(sql: string) {
  const [{ count }] = await frontSequelize.query<CountRow>(sql, {
    type: QueryTypes.SELECT,
  });
  return count;
}

async function countMissingConversationSandboxes() {
  return countRows(`
    SELECT COUNT(*)::int AS "count"
    FROM "sandboxes" s
    WHERE NOT EXISTS (
      SELECT 1 FROM "conversation_sandboxes" cs
      WHERE cs."workspaceId" = s."workspaceId"
        AND cs."conversationId" = s."conversationId"
        AND cs."sandboxId" = s."id"
    )
  `);
}

async function countExtraConversationSandboxes() {
  return countRows(`
    SELECT COUNT(*)::int AS "count"
    FROM "conversation_sandboxes" cs
    WHERE NOT EXISTS (
      SELECT 1 FROM "sandboxes" s
      WHERE s."workspaceId" = cs."workspaceId"
        AND s."conversationId" = cs."conversationId"
        AND s."id" = cs."sandboxId"
    )
  `);
}

makeScript({}, async ({ execute }, logger) => {
  const missingBefore = await countMissingConversationSandboxes();
  const extraBefore = await countExtraConversationSandboxes();

  logger.info(
    { missingBefore, extraBefore },
    "Checked sandbox ownership drift"
  );

  if (execute) {
    await countRows(`
      WITH inserted AS (
        INSERT INTO "conversation_sandboxes"
          ("createdAt", "updatedAt", "conversationId", "sandboxId", "workspaceId")
        SELECT s."createdAt", NOW(), s."conversationId", s."id", s."workspaceId"
        FROM "sandboxes" s
        WHERE NOT EXISTS (
          SELECT 1 FROM "conversation_sandboxes" cs
          WHERE cs."workspaceId" = s."workspaceId"
            AND cs."conversationId" = s."conversationId"
            AND cs."sandboxId" = s."id"
        )
        ON CONFLICT DO NOTHING RETURNING 1
      )
      SELECT COUNT(*)::int AS "count" FROM inserted
    `);
  }

  const missingAfter = await countMissingConversationSandboxes();
  const extraAfter = await countExtraConversationSandboxes();

  if (execute && (missingAfter > 0 || extraAfter > 0)) {
    throw new Error(
      `conversation_sandboxes is not ISO with sandboxes: missing=${missingAfter} extra=${extraAfter}`
    );
  }
});
