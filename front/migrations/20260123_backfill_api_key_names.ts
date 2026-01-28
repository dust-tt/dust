import { DEFAULT_SYSTEM_KEY_NAME } from "@app/lib/resources/key_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const KeyModelWithBypass: ModelStaticWorkspaceAware<KeyModel> = KeyModel;

  const keysWithNullName = await KeyModelWithBypass.findAll({
    // @ts-expect-error backfill for null names
    where: { name: null },
    // WORKSPACE_ISOLATION_BYPASS: Migration script operates across all workspaces to backfill null names.
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  logger.info(
    { keyCount: keysWithNullName.length },
    "Found keys with null names to backfill"
  );

  for (const key of keysWithNullName) {
    const newName = key.isSystem
      ? DEFAULT_SYSTEM_KEY_NAME
      : `API Key ${generateRandomModelSId()}`;
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
