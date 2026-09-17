import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Op } from "sequelize";

const PROVIDER_TO_REMOVE: ModelProviderIdType = "xai";
const UPDATE_CONCURRENCY = 8;
const KNOWN_PROVIDERS = new Set<string>(MODEL_PROVIDER_IDS);

interface WhitelistChange {
  workspaceId: string;
  before: ModelProviderIdType[];
  after: ModelProviderIdType[];
  updatedAt: Date;
}

// Retiring a provider is not a workspace edit, so the row keeps the timestamp of whatever the
// workspace's last real change was. Raw SQL for two reasons: `updateWorkspaceSettings` has no
// silent path, and Sequelize drops `updatedAt` from the SET clause of a bulk update. The cache is
// invalidated again afterwards because the resource write cached the bumped timestamp.
async function restoreUpdatedAt(
  workspaceId: string,
  updatedAt: Date
): Promise<void> {
  await frontSequelize.query(
    `UPDATE workspaces SET "updatedAt" = :updatedAt WHERE "sId" = :workspaceId`,
    { replacements: { updatedAt, workspaceId } }
  );
  await WorkspaceResource.invalidateCache(workspaceId);
}

export async function removeXaiFromWhitelistedProviders({
  execute,
  logger,
}: {
  execute: boolean;
  logger: Logger;
}): Promise<{ updated: WhitelistChange[] }> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Raw rows, not WorkspaceResource: materialization overlays provider kill switches onto
  // whiteListedProviders, and persisting that overlay would make a temporary kill switch permanent.
  // ponytail: single unpaginated scan — whitelists are rare, so the matched set is small.
  const rows = await WorkspaceModel.findAll({
    where: {
      whiteListedProviders: { [Op.contains]: [PROVIDER_TO_REMOVE] },
      updatedAt: { [Op.lt]: startOfToday },
    },
    attributes: ["sId", "whiteListedProviders", "updatedAt"],
    order: [["id", "ASC"]],
  });

  const updated = rows.flatMap((row) => {
    const before = row.whiteListedProviders;
    // A null whitelist implicitly allows every provider, xai included. Writing the explicit
    // "everything but xai" list would freeze the whitelist for good, so those rows are left alone.
    // Op.contains never matches null, so this guard only keeps that guarantee visible.
    if (!before) {
      return [];
    }
    // The column validator rejects any id no longer in MODEL_PROVIDER_IDS, so a row still carrying
    // a retired provider cannot be written back at all. Skipping it here rather than letting the
    // write throw keeps the run going and keeps the dry run honest about what it would do.
    const retiredProviders = before.filter(
      (provider) => !KNOWN_PROVIDERS.has(provider)
    );
    if (retiredProviders.length > 0) {
      logger.warn(
        { workspaceId: row.sId, before, retiredProviders },
        `Skipping workspace ${row.sId}: its whitelist holds retired provider(s) ${retiredProviders.join(", ")} that the column validator would reject.`
      );
      return [];
    }
    return [
      {
        workspaceId: row.sId,
        before,
        after: before.filter((provider) => provider !== PROVIDER_TO_REMOVE),
        updatedAt: row.updatedAt,
      },
    ];
  });

  for (const change of updated) {
    logger.info(
      change,
      `${execute ? "Removing" : "[DRY RUN] Would remove"} ${PROVIDER_TO_REMOVE} from workspace ${change.workspaceId}.`
    );
  }

  if (!execute) {
    logger.info(
      { workspaceCount: updated.length },
      "Dry run complete (use --execute to write)."
    );
    return { updated };
  }

  await concurrentExecutor(
    updated,
    async ({ workspaceId, after, updatedAt }) => {
      // Written through the resource so the workspace cache is invalidated.
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        logger.error(
          { workspaceId },
          "Workspace disappeared between scan and update, skipping."
        );
        return;
      }
      await workspace.updateWorkspaceSettings({
        whiteListedProviders: after,
      });
      await restoreUpdatedAt(workspaceId, updatedAt);
    },
    { concurrency: UPDATE_CONCURRENCY }
  );

  logger.info({ workspaceCount: updated.length }, "Migration complete.");

  return { updated };
}

function runScript(): void {
  makeScript({}, async ({ execute }, logger) => {
    await removeXaiFromWhitelistedProviders({ execute, logger });
  });
}

if (
  process.argv[1]?.endsWith("20260917_remove_xai_from_whitelisted_providers.ts")
) {
  runScript();
}
