import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const SUSPEND_SKILL_EDITOR_MEMBERSHIPS_SQL = `
UPDATE group_memberships gm
SET status = 'suspended'
WHERE gm."groupId" IN (
    SELECT g.id
    FROM groups g
    INNER JOIN group_skills gs ON (g.id = gs."groupId")
    WHERE g.kind = 'skill_editors'
    -- Only groups that have no active skills
    AND NOT EXISTS (
        SELECT 1
        FROM group_skills gs2
        INNER JOIN skill_configurations sc ON (gs2."skillConfigurationId" = sc.id)
        WHERE gs2."groupId" = g.id
        AND sc.status = 'active'
    )
)
-- Safety: only update if not already suspended
AND gm.status != 'suspended';
`;

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    "Suspending group_memberships for skill_editors groups with no active skills"
  );

  if (execute) {
    const [_, rowCount] = await frontSequelize.query(
      SUSPEND_SKILL_EDITOR_MEMBERSHIPS_SQL,
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
          INNER JOIN group_skills gs ON (g.id = gs."groupId")
          WHERE g.kind = 'skill_editors'
          AND NOT EXISTS (
              SELECT 1
              FROM group_skills gs2
              INNER JOIN skill_configurations sc ON (gs2."skillConfigurationId" = sc.id)
              WHERE gs2."groupId" = g.id
              AND sc.status = 'active'
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
