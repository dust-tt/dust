import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import {
  CLAUDE_SONNET_4_6_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { chunk, uniq } from "lodash";
import { Op } from "sequelize";

// `20260810_migrate_sonnet46_medium_to_auto.ts` moved every active agent on Claude Sonnet 4.6 with
// medium reasoning to the Auto meta-model. It swept in agents that had only landed on Sonnet 4.6
// medium because an earlier in-place migration put them there (e.g.
// `20260518_migrate_legacy_anthropic_models.ts`), burying a model the builder had actually picked.
//
// Nothing was on Auto before that migration ran, so any version showing Auto and created by the end
// of the migration window is one it flipped in place. From there we walk the agent's whole history:
// if any earlier version shows a model other than Sonnet 4.6 medium, the agent had a deliberate
// model choice and goes back to Sonnet 4.6. An agent that has only ever been on Sonnet 4.6 medium
// stays on Auto.
const MIGRATION_WINDOW_MS = 2 * 60 * 60 * 1000;
const MIGRATED_AT = new Date(1786379966539);
const MIGRATION_WINDOW_END = new Date(
  MIGRATED_AT.getTime() + MIGRATION_WINDOW_MS
);

const REVERT_TO = {
  providerId: "anthropic",
  modelId: CLAUDE_SONNET_4_6_MODEL_ID,
  reasoningEffort: "medium",
} as const;

const FETCH_CHUNK_SIZE = 500;

const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

export type AgentModelVersion = Pick<
  AgentConfigurationModel,
  "createdAt" | "modelId" | "reasoningEffort" | "version"
>;

export type AutoRevertPlan<T extends AgentModelVersion> =
  | { shouldRevert: false }
  | {
      shouldRevert: true;
      switchedVersion: T;
      deliberateVersion: T;
      autoVersions: T[];
    };

function isAuto(version: AgentModelVersion): boolean {
  return version.modelId === AUTO_MODEL_ID;
}

function isSonnet46or45Medium(version: AgentModelVersion): boolean {
  return (
    (version.modelId === CLAUDE_SONNET_4_6_MODEL_ID ||
      version.modelId === CLAUDE_4_5_SONNET_20250929_MODEL_ID) &&
    version.reasoningEffort === "medium"
  );
}

/**
 * Decides what to roll back for a single agent, given its full version history in ascending
 * version order.
 */
export function planAutoRevert<T extends AgentModelVersion>(
  versions: T[]
): AutoRevertPlan<T> {
  // The version the migration flipped: the first one on Auto, gated at the end of the window so
  // that a builder switching to Auto later on is left alone.
  const switchIndex = versions.findIndex(
    (version) => isAuto(version) && version.createdAt <= MIGRATION_WINDOW_END
  );
  if (switchIndex < 0) {
    return { shouldRevert: false };
  }

  // Only ever Sonnet 4.6 or 4.5 medium before the switch (or no earlier version at all): nothing was
  // buried, the agent stays on Auto.
  const deliberateVersion = versions
    .slice(0, switchIndex)
    .find((version) => !isSonnet46or45Medium(version));
  if (!deliberateVersion) {
    return { shouldRevert: false };
  }

  // Roll back the unbroken run of Auto versions starting at the switch: versions saved after the
  // migration inherited Auto from it. A version that is not on Auto ends the run — an Auto version
  // above it is a fresh, deliberate choice.
  const autoVersions: T[] = [];
  for (const version of versions.slice(switchIndex)) {
    if (!isAuto(version)) {
      break;
    }
    autoVersions.push(version);
  }

  return {
    shouldRevert: true,
    switchedVersion: versions[switchIndex],
    deliberateVersion,
    autoVersions,
  };
}

export async function revertSonnet46AutoSwitch({
  execute,
  logger,
}: {
  execute: boolean;
  logger: Logger;
}): Promise<{
  revertedAgentIds: string[];
  revertedVersionCount: number;
  keptOnAutoCount: number;
}> {
  const switchedVersions = await AgentConfigurationModelWithBypass.findAll({
    attributes: ["sId"],
    where: {
      modelId: AUTO_MODEL_ID,
      createdAt: { [Op.lte]: MIGRATION_WINDOW_END },
    },
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const switchedAgentIds = uniq(switchedVersions.map((agent) => agent.sId));

  logger.info(
    {
      count: switchedAgentIds.length,
      windowEnd: MIGRATION_WINDOW_END.toISOString(),
    },
    `Found ${switchedAgentIds.length} agents switched to ${AUTO_MODEL_ID} by the end of the migration window.`
  );

  if (switchedAgentIds.length === 0) {
    return {
      revertedAgentIds: [],
      revertedVersionCount: 0,
      keptOnAutoCount: 0,
    };
  }

  // Full version history of each agent, ascending. `sId` + `version` is unique, so no workspace
  // scoping is needed to reconstruct a history.
  const versionsByAgentId = new Map<string, AgentConfigurationModel[]>();

  for (const agentIds of chunk(switchedAgentIds, FETCH_CHUNK_SIZE)) {
    const versions = await AgentConfigurationModelWithBypass.findAll({
      attributes: [
        "id",
        "sId",
        "version",
        "status",
        "createdAt",
        "providerId",
        "modelId",
        "reasoningEffort",
        "workspaceId",
      ],
      where: { sId: { [Op.in]: agentIds } },
      order: [["version", "ASC"]],
      // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    for (const version of versions) {
      const history = versionsByAgentId.get(version.sId);
      if (history) {
        history.push(version);
      } else {
        versionsByAgentId.set(version.sId, [version]);
      }
    }
  }

  const toRevert: AgentConfigurationModel[] = [];
  const revertedAgentIds: string[] = [];
  let keptOnAutoCount = 0;

  for (const [agentId, versions] of versionsByAgentId) {
    const plan = planAutoRevert(versions);

    if (!plan.shouldRevert) {
      keptOnAutoCount++;
      continue;
    }

    const { switchedVersion, deliberateVersion, autoVersions } = plan;

    logger.info(
      {
        sId: agentId,
        workspaceId: switchedVersion.workspaceId,
        switchedAtVersion: switchedVersion.version,
        revertedVersions: autoVersions.map((version) => version.version),
        deliberateVersion: deliberateVersion.version,
        deliberateModelId: deliberateVersion.modelId,
        deliberateReasoningEffort: deliberateVersion.reasoningEffort,
      },
      `Reverting ${autoVersions.length} ${AUTO_MODEL_ID} version(s) of agent ${agentId} to ${REVERT_TO.modelId}: version ${deliberateVersion.version} was on ${deliberateVersion.modelId}.`
    );

    toRevert.push(...autoVersions);
    revertedAgentIds.push(agentId);
  }

  logger.info(
    {
      agentCount: revertedAgentIds.length,
      versionCount: toRevert.length,
      keptOnAutoCount,
    },
    `Reverting ${toRevert.length} agent version(s) to ${REVERT_TO.modelId} (${REVERT_TO.reasoningEffort} reasoning), keeping ${keptOnAutoCount} agents on ${AUTO_MODEL_ID}.`
  );

  if (execute) {
    for (const version of toRevert) {
      await version.update(REVERT_TO);
    }

    logger.info("Migration complete.");
  }

  return {
    revertedAgentIds,
    revertedVersionCount: toRevert.length,
    keptOnAutoCount,
  };
}

function runScript(): void {
  makeScript({}, async ({ execute }, logger) => {
    await revertSonnet46AutoSwitch({ execute, logger });
  });
}

if (
  process.argv[1]?.endsWith("20260813_revert_sonnet46_to_auto_migration.ts")
) {
  runScript();
}
