import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { Op } from "sequelize";

const PROVIDER_TO_REMOVE: ModelProviderIdType = "xai";
const UPDATE_CONCURRENCY = 8;
const KNOWN_PROVIDERS = new Set<string>(MODEL_PROVIDER_IDS);

// Workspaces holding this flag keep xai. A plain string, not a WhitelistableFeature: the flag is
// not declared in WHITELISTABLE_FEATURES_CONFIG, and the resource lookup below takes names that
// are not.
export const XAI_EXEMPTION_FEATURE_FLAG = "xai_feature";

async function listExemptWorkspaceModelIds(
  logger: Logger
): Promise<Set<ModelId>> {
  const flagCount = await FeatureFlagResource.countForAllWorkspacesByName(
    XAI_EXEMPTION_FEATURE_FLAG
  );
  if (flagCount === 0) {
    // Loud on purpose: a typo'd flag name looks exactly like "nobody is exempt", and the
    // difference only shows up once xai has already been stripped from someone who needed it.
    logger.warn(
      { featureFlag: XAI_EXEMPTION_FEATURE_FLAG },
      `No workspace holds ${XAI_EXEMPTION_FEATURE_FLAG}, so nothing will be exempted. Confirm the flag name before running with --execute.`
    );
    return new Set();
  }

  const flags = await FeatureFlagResource.dangerouslyListForAllWorkspacesByName(
    XAI_EXEMPTION_FEATURE_FLAG,
    { limit: flagCount }
  );
  logger.info(
    { featureFlag: XAI_EXEMPTION_FEATURE_FLAG, workspaceCount: flags.length },
    `${flags.length} workspace(s) hold ${XAI_EXEMPTION_FEATURE_FLAG} and will keep ${PROVIDER_TO_REMOVE}.`
  );

  return new Set(flags.map((flag) => flag.workspaceId));
}

interface WhitelistChange {
  workspaceId: string;
  before: ModelProviderIdType[];
  after: ModelProviderIdType[];
  // Ids the row carried that are no longer declared in MODEL_PROVIDER_IDS. Logged separately
  // because dropping them goes beyond what this migration's name promises.
  retiredProviders: ModelProviderIdType[];
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

  const exemptWorkspaceModelIds = await listExemptWorkspaceModelIds(logger);

  // Raw rows, not WorkspaceResource: materialization overlays provider kill switches onto
  // whiteListedProviders, and persisting that overlay would make a temporary kill switch permanent.
  // ponytail: single unpaginated scan — whitelists are rare, so the matched set is small.
  const rows = await WorkspaceModel.findAll({
    where: {
      whiteListedProviders: { [Op.contains]: [PROVIDER_TO_REMOVE] },
      updatedAt: { [Op.lt]: startOfToday },
    },
    attributes: ["id", "sId", "whiteListedProviders", "updatedAt"],
    order: [["id", "ASC"]],
  });

  const updated = rows.flatMap((row) => {
    if (exemptWorkspaceModelIds.has(row.id)) {
      logger.info(
        { workspaceId: row.sId, featureFlag: XAI_EXEMPTION_FEATURE_FLAG },
        `Exempting workspace ${row.sId}: it holds ${XAI_EXEMPTION_FEATURE_FLAG}.`
      );
      return [];
    }

    const before = row.whiteListedProviders;
    // A null whitelist implicitly allows every provider, xai included. Writing the explicit
    // "everything but xai" list would freeze the whitelist for good, so those rows are left alone.
    // Op.contains never matches null, so this guard only keeps that guarantee visible.
    if (!before) {
      return [];
    }
    // Retired ids go out with xai. The column validator rejects any id no longer in
    // MODEL_PROVIDER_IDS, so keeping them would make the row unwritable.
    const retiredProviders = before.filter(
      (provider) => !KNOWN_PROVIDERS.has(provider)
    );
    return [
      {
        workspaceId: row.sId,
        before,
        after: before.filter(
          (provider) =>
            provider !== PROVIDER_TO_REMOVE && KNOWN_PROVIDERS.has(provider)
        ),
        retiredProviders,
        updatedAt: row.updatedAt,
      },
    ];
  });

  for (const change of updated) {
    const removed = [PROVIDER_TO_REMOVE, ...change.retiredProviders].join(", ");
    logger.info(
      change,
      `${execute ? "Removing" : "[DRY RUN] Would remove"} ${removed} from workspace ${change.workspaceId}.`
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
