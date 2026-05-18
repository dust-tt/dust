import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

// Copy from user_project_notification_preferences into
// user_project_preferences.
makeScript({}, async ({ execute }, logger) => {
  const [{ count: pendingCountStr }] = await frontSequelize.query<{
    count: string;
  }>(
    `SELECT COUNT(*) AS count
       FROM "user_project_notification_preferences" old
       WHERE NOT EXISTS (
         SELECT 1 FROM "user_project_preferences" new
         WHERE new."workspaceId" = old."workspaceId"
           AND new."userId" = old."userId"
           AND new."spaceId" = old."spaceId"
       )`,
    { type: QueryTypes.SELECT }
  );
  const pendingCount = parseInt(pendingCountStr);

  logger.info(
    { pendingCount, execute },
    execute
      ? `Copying ${pendingCount} rows`
      : `Would copy ${pendingCount} rows (dry run)`
  );

  if (!execute) {
    return;
  }

  await frontSequelize.query(
    `INSERT INTO "user_project_preferences"
       ("createdAt", "updatedAt", "notificationPreference", "isStarred", "workspaceId", "userId", "spaceId")
     SELECT "createdAt", "updatedAt", "preference", "isStarred", "workspaceId", "userId", "spaceId"
       FROM "user_project_notification_preferences"
     ON CONFLICT ("workspaceId", "userId", "spaceId") DO NOTHING`
  );

  logger.info({}, "Copy done");
});
