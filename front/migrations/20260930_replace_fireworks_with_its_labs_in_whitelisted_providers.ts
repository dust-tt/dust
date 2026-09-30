import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { Op, QueryTypes } from "sequelize";

const HOST_TO_REPLACE = "fireworks";
const DEEPSEEK_LAB = "deepseek";
const UPDATE_CONCURRENCY = 8;

// Every lab Fireworks serves a model for, legacy ones included: the "fireworks" entry granted all
// of them, so replacing it with this list keeps each workspace's access unchanged. Listed by hand:
// MiniMax backs a global agent without being in SUPPORTED_MODEL_CONFIGS.
export const FIREWORKS_SERVED_LABS: readonly string[] = [
  "deepseek",
  "moonshot",
  "minimax",
  "zai",
  "thinking_machines",
];

type WhitelistChange = {
  workspaceId: string;
  before: string[];
  after: string[];
};

export function replaceFireworksWithItsLabs(before: string[]): string[] {
  const kept = before.filter((entry) => entry !== HOST_TO_REPLACE);
  return [
    ...kept,
    ...FIREWORKS_SERVED_LABS.filter((lab) => !kept.includes(lab)),
  ];
}

// Raw SQL rather than `updateWorkspaceSettings`: the column validator only accepts provider ids
// until whitelisting switches to labs. It also leaves `updatedAt` alone, since this is not a
// workspace edit. The `before` match skips a row an admin re-saved between scan and write.
async function writeWhitelist({
  workspaceId,
  before,
  after,
}: WhitelistChange): Promise<boolean> {
  const [, affectedRows] = await frontSequelize.query(
    `UPDATE workspaces SET "whiteListedProviders" = ARRAY[:after]::varchar(255)[]
     WHERE "sId" = :workspaceId AND "whiteListedProviders" = ARRAY[:before]::varchar(255)[]`,
    { replacements: { workspaceId, before, after }, type: QueryTypes.UPDATE }
  );
  await WorkspaceResource.invalidateCache(workspaceId);
  return affectedRows === 1;
}

type ReplaceFireworksWithItsLabsParams = {
  execute: boolean;
  logger: Logger;
};

export async function replaceFireworksWithItsLabsInWhitelistedProviders({
  execute,
  logger,
}: ReplaceFireworksWithItsLabsParams): Promise<{
  updated: WhitelistChange[];
  deepseekWithoutFireworks: string[];
}> {
  // Raw rows, not WorkspaceResource: materialization overlays provider kill switches onto
  // whiteListedProviders, and persisting that overlay would make a temporary kill switch permanent.
  // Single unpaginated scan: whitelists are rare, so the matched set is small.
  const rows = await WorkspaceModel.findAll({
    where: {
      whiteListedProviders: {
        [Op.overlap]: [HOST_TO_REPLACE, DEEPSEEK_LAB],
      },
    },
    attributes: ["sId", "whiteListedProviders"],
    order: [["id", "ASC"]],
  });

  const updated: WhitelistChange[] = [];
  const deepseekWithoutFireworks: string[] = [];
  for (const { sId, whiteListedProviders } of rows) {
    const before: string[] = whiteListedProviders ?? [];
    if (before.includes(HOST_TO_REPLACE)) {
      updated.push({
        workspaceId: sId,
        before,
        after: replaceFireworksWithItsLabs(before),
      });
      continue;
    }
    deepseekWithoutFireworks.push(sId);
  }

  for (const change of updated) {
    logger.info(
      change,
      `${execute ? "Replacing" : "[DRY RUN] Would replace"} ${HOST_TO_REPLACE} with its labs in workspace ${change.workspaceId}.`
    );
  }
  // Not rewritten: whitelisting the DeepSeek lab will also grant DeepSeek models served by
  // Fireworks, which these workspaces cannot reach today.
  for (const workspaceId of deepseekWithoutFireworks) {
    logger.warn(
      { workspaceId },
      `Workspace ${workspaceId} whitelists ${DEEPSEEK_LAB} without ${HOST_TO_REPLACE}: it will gain Fireworks-served DeepSeek models.`
    );
  }
  logger.info(
    {
      fireworksLabs: FIREWORKS_SERVED_LABS,
      updatedCount: updated.length,
      deepseekWithoutFireworksCount: deepseekWithoutFireworks.length,
    },
    execute ? "Writing changes." : "Dry run complete (use --execute to write)."
  );

  if (!execute) {
    return { updated, deepseekWithoutFireworks };
  }

  const written = await concurrentExecutor(updated, writeWhitelist, {
    concurrency: UPDATE_CONCURRENCY,
  });
  const skipped = updated.filter((_, i) => !written[i]);
  for (const { workspaceId } of skipped) {
    logger.warn(
      { workspaceId },
      "Whitelist changed since the scan, skipped. Re-run to pick it up."
    );
  }
  logger.info(
    { writtenCount: updated.length - skipped.length },
    "Migration complete."
  );

  return { updated, deepseekWithoutFireworks };
}

function runScript(): void {
  makeScript({}, async ({ execute }, logger) => {
    await replaceFireworksWithItsLabsInWhitelistedProviders({
      execute,
      logger,
    });
  });
}

if (
  process.argv[1]?.endsWith(
    "20260930_replace_fireworks_with_its_labs_in_whitelisted_providers.ts"
  )
) {
  runScript();
}
