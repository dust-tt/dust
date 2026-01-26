import { DEFAULT_SYSTEM_KEY_NAME } from "@app/lib/resources/key_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  // @ts-expect-error name is now not nullable in our schema, but we need to query for null values during migration.
  const keysWithNullName = await KeyModel.findAll({ where: { name: null } });

  logger.info(
    { keyCount: keysWithNullName.length },
    "Found keys with null names to backfill"
  );

  for (const key of keysWithNullName) {
    const newName = key.isSystem
      ? DEFAULT_SYSTEM_KEY_NAME
      : `API Key ${key.secret.slice(-4)}`;
    logger.info(
      { keyId: key.id, isSystem: key.isSystem, newName },
      execute ? "Updating key name" : "Would update key name"
    );

    if (execute) {
      await KeyModel.update(
        { name: newName },
        {
          where: { id: key.id },
        }
      );
    }
  }

  logger.info(
    { execute },
    execute ? "Backfill completed" : "Dry run completed"
  );
});
