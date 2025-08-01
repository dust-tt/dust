import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const KEY_UPDATE_CONCURRENCY = 5;

const updateKeyScopeForRegularGroups = async (execute: boolean) => {
  // Find all keys that are not system keys and are linked to regular groups
  const keysToUpdate = await KeyModel.findAll({
    where: {
      isSystem: false,
      scope: "default",
    },
    include: [
      {
        model: GroupModel,
        where: {
          kind: "regular",
        },
        required: true,
      },
    ],
  });

  logger.info(
    { count: keysToUpdate.length },
    execute
      ? `Updating ${keysToUpdate.length} keys to scope='restricted_group_only'`
      : `Would update ${keysToUpdate.length} keys to scope='restricted_group_only'`
  );

  if (execute) {
    let updated = 0;

    await concurrentExecutor(
      keysToUpdate,
      async (key) => {
        await key.update({ scope: "restricted_group_only" });
        updated++;

        if (updated % 100 === 0) {
          logger.info({ updated }, `Progress: updated ${updated} keys`);
        }
      },
      { concurrency: KEY_UPDATE_CONCURRENCY }
    );

    logger.info(
      { updated },
      `Completed: updated all ${updated} keys to scope='restricted_group_only'`
    );
  }
};

makeScript({}, async ({ execute }) => {
  await updateKeyScopeForRegularGroups(execute);
});
