import { readFile, writeFile } from "node:fs/promises";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import isEqual from "lodash/isEqual";
import { Op, QueryTypes } from "sequelize";
import { z } from "zod";

const HOST_TO_REPLACE = "fireworks";
const DEEPSEEK_LAB = "deepseek";
const CACHE_INVALIDATION_CONCURRENCY = 8;

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

const WhitelistChangeSchema = z.object({
  workspaceId: z.string(),
  before: z.array(z.string()),
  after: z.array(z.string()),
});
type WhitelistChange = z.infer<typeof WhitelistChangeSchema>;

// With `keepFireworks`, only adds the labs: lets this run before whitelisting switches to labs,
// with a second run without it removing fireworks once the switch is deployed.
export function replaceFireworksWithItsLabs(
  before: string[],
  keepFireworks: boolean
): string[] {
  const kept = keepFireworks
    ? before
    : before.filter((entry) => entry !== HOST_TO_REPLACE);
  return [
    ...kept,
    ...FIREWORKS_SERVED_LABS.filter((lab) => !kept.includes(lab)),
  ];
}

type WhitelistWrite = {
  workspaceId: string;
  from: string[];
  to: string[];
};

// Raw SQL rather than `updateWorkspaceSettings`: the column validator only accepts provider ids
// until whitelisting switches to labs. It also leaves `updatedAt` alone, since this is not a
// workspace edit. The `from` match skips a row an admin re-saved in the meantime.
async function writeWhitelists(
  writes: WhitelistWrite[],
  logger: Logger
): Promise<number> {
  if (writes.length === 0) {
    return 0;
  }
  const writtenRows = await frontSequelize.query<{ sId: string }>(
    `UPDATE workspaces w SET "whiteListedProviders" = v."to"
     FROM jsonb_to_recordset(CAST(:writes AS jsonb))
       AS v("workspaceId" text, "from" varchar(255)[], "to" varchar(255)[])
     WHERE w."sId" = v."workspaceId" AND w."whiteListedProviders" = v."from"
     RETURNING w."sId"`,
    {
      replacements: { writes: JSON.stringify(writes) },
      type: QueryTypes.SELECT,
    }
  );
  const written = new Set(writtenRows.map(({ sId }) => sId));
  await concurrentExecutor(
    [...written],
    (workspaceId) => WorkspaceResource.invalidateCache(workspaceId),
    { concurrency: CACHE_INVALIDATION_CONCURRENCY }
  );

  const skipped = writes.filter(({ workspaceId }) => !written.has(workspaceId));
  for (const { workspaceId } of skipped) {
    logger.warn(
      { workspaceId },
      "Whitelist changed since it was read, skipped."
    );
  }
  return writes.length - skipped.length;
}

type ReplaceFireworksWithItsLabsParams = {
  execute: boolean;
  logger: Logger;
  // Add the labs but leave fireworks in place.
  keepFireworks?: boolean;
  // Required with `execute`: every planned change is written there before any row is touched.
  backupFile?: string;
};

export async function replaceFireworksWithItsLabsInWhitelistedProviders({
  execute,
  logger,
  keepFireworks = false,
  backupFile,
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
    if (!before.includes(HOST_TO_REPLACE)) {
      deepseekWithoutFireworks.push(sId);
      continue;
    }
    const after = replaceFireworksWithItsLabs(before, keepFireworks);
    // Only with `keepFireworks`: every lab is already there.
    if (isEqual(after, before)) {
      continue;
    }
    updated.push({ workspaceId: sId, before, after });
  }

  const action = keepFireworks
    ? `add ${HOST_TO_REPLACE}'s labs`
    : `replace ${HOST_TO_REPLACE} with its labs`;
  for (const change of updated) {
    logger.info(
      change,
      `${execute ? "Will" : "[DRY RUN] Would"} ${action} in workspace ${change.workspaceId}.`
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
      keepFireworks,
      updatedCount: updated.length,
      deepseekWithoutFireworksCount: deepseekWithoutFireworks.length,
    },
    execute ? "Writing changes." : "Dry run complete (use --execute to write)."
  );

  if (!execute) {
    return { updated, deepseekWithoutFireworks };
  }

  if (!backupFile) {
    throw new Error("--backupFile is required with --execute.");
  }
  await writeFile(backupFile, JSON.stringify(updated, null, 2));
  logger.info({ backupFile }, "Backup written.");

  const writtenCount = await writeWhitelists(
    updated.map(({ workspaceId, before, after }) => ({
      workspaceId,
      from: before,
      to: after,
    })),
    logger
  );
  logger.info({ writtenCount }, "Migration complete.");

  return { updated, deepseekWithoutFireworks };
}

type RestoreWhitelistsFromBackupParams = {
  execute: boolean;
  logger: Logger;
  backupFile: string;
};

// Puts back each row's `before` value, only where it still holds the migrated `after` value: a
// whitelist an admin saved since is left alone and reported.
export async function restoreWhitelistsFromBackup({
  execute,
  logger,
  backupFile,
}: RestoreWhitelistsFromBackupParams): Promise<{ writtenCount: number }> {
  const changes = z
    .array(WhitelistChangeSchema)
    .parse(JSON.parse(await readFile(backupFile, "utf8")));

  logger.info(
    { backupFile, workspaceCount: changes.length },
    execute
      ? "Restoring whitelists."
      : "[DRY RUN] Would restore whitelists (use --execute to write)."
  );
  if (!execute) {
    return { writtenCount: 0 };
  }

  const writtenCount = await writeWhitelists(
    changes.map(({ workspaceId, before, after }) => ({
      workspaceId,
      from: after,
      to: before,
    })),
    logger
  );
  logger.info({ writtenCount }, "Rollback complete.");

  return { writtenCount };
}

function runScript(): void {
  makeScript(
    {
      backupFile: {
        type: "string",
        describe: "Where to write the changes before executing them",
      },
      keepFireworks: {
        type: "boolean",
        default: false,
        describe: "Add fireworks' labs without removing fireworks",
      },
      rollbackFrom: {
        type: "string",
        describe: "Restore the whitelists saved in this backup file",
      },
    },
    async ({ execute, backupFile, keepFireworks, rollbackFrom }, logger) => {
      if (rollbackFrom) {
        await restoreWhitelistsFromBackup({
          execute,
          logger,
          backupFile: rollbackFrom,
        });
        return;
      }
      await replaceFireworksWithItsLabsInWhitelistedProviders({
        execute,
        logger,
        keepFireworks,
        backupFile,
      });
    }
  );
}

if (
  process.argv[1]?.endsWith(
    "20260930_replace_fireworks_with_its_labs_in_whitelisted_providers.ts"
  )
) {
  runScript();
}
