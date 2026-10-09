import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { USER_PRONOUNS_METADATA_KEY } from "@app/types/user_profile";

/**
 * Copies pronouns from the global `pronouns` user metadata to the `users.pronouns` column.
 * `updatePronouns` writes both and invalidates the user cache, so the script can be re-run safely.
 * Run it once the dual write is deployed, before switching reads to the column.
 */
makeScript({}, async ({ execute }, logger) => {
  const rows = await UserMetadataModel.findAll({
    where: { key: USER_PRONOUNS_METADATA_KEY, workspaceId: null },
  });
  logger.info({ count: rows.length }, "Found pronouns metadata rows.");

  const pronounsByUserModelId = new Map(
    rows.map((row) => [row.userId, row.value])
  );
  const users = await UserResource.fetchByModelIds([
    ...pronounsByUserModelId.keys(),
  ]);

  for (const user of users) {
    const pronouns = pronounsByUserModelId.get(user.id);
    if (pronouns === undefined) {
      throw new Error(`Missing pronouns metadata for user ${user.sId}.`);
    }
    if (execute) {
      await user.updatePronouns(pronouns);
    }
  }

  logger.info(
    { count: users.length, execute },
    execute ? "Backfilled users pronouns." : "Dry run: would backfill pronouns."
  );
});
