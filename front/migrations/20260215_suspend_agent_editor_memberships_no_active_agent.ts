import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const SUSPEND_AGENT_EDITOR_MEMBERSHIPS_SQL = `
UPDATE group_memberships gm
SET status = 'suspended'
WHERE gm."groupId" IN (
    SELECT g.id
    FROM groups g
    INNER JOIN group_agents ga ON (g.id = ga."groupId")
    WHERE g.kind = 'agent_editors'
    -- Only groups that have no active agents
    AND NOT EXISTS (
        SELECT 1
        FROM group_agents ga2
        INNER JOIN agent_configurations ac ON (ga2."agentConfigurationId" = ac.id)
        WHERE ga2."groupId" = g.id
        AND ac.status = 'active'
    )
)
-- Safety: only update if not already suspended
AND gm.status != 'suspended';
`;

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    "Suspending group_memberships for agent_editors groups with no active agents"
  );

  if (execute) {
    const [_, rowCount] = await frontSequelize.query(
      SUSPEND_AGENT_EDITOR_MEMBERSHIPS_SQL,
      {
        type: QueryTypes.UPDATE,
      }
    );
    logger.info(
      { updatedCount: rowCount },
      "Updated group_memberships to suspended"
    );
  } else {
    const [countResult] = await frontSequelize.query<{ count: string }>(
      `
      SELECT COUNT(*) as count
      FROM group_memberships gm
      WHERE gm."groupId" IN (
          SELECT g.id
          FROM groups g
          INNER JOIN group_agents ga ON (g.id = ga."groupId")
          WHERE g.kind = 'agent_editors'
          AND NOT EXISTS (
              SELECT 1
              FROM group_agents ga2
              INNER JOIN agent_configurations ac ON (ga2."agentConfigurationId" = ac.id)
              WHERE ga2."groupId" = g.id
              AND ac.status = 'active'
          )
      )
      AND gm.status != 'suspended';
      `,
      { type: QueryTypes.SELECT }
    );
    logger.info(
      { wouldUpdateCount: countResult.count },
      "Dry run: would suspend this many group_memberships (use --execute to apply)"
    );
  }
});
