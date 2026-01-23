import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const keysWithNullName = await KeyModel.findAll({
    where: {
      isSystem: false,
      // @ts-expect-error name is now not nullable in our database schema, but we need to query for null values during migration.
      name: null,
    },
  });

  logger.info(
    { keyCount: keysWithNullName.length },
    "Found non-system keys with null names to backfill"
  );

  for (const key of keysWithNullName) {
    const newName = `API Key ${key.secret.slice(-4)}`;
    logger.info(
      { keyId: key.id, newName },
      execute ? "Updating key name" : "Would update key name"
    );

    if (execute) {
      await KeyModel.update(
        { name: newName },
        {
          where: {
            id: key.id,
          },
        }
      );
    }
  }

  logger.info(
    { execute },
    execute ? "Backfill completed" : "Dry run completed"
  );
});
