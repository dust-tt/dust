import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { literal, Op } from "sequelize";

type MigrationWorkspace = Pick<LightWorkspaceType, "id" | "sId">;

export type AgentIdentityBackfillStats = {
  logicalAgentCount: number;
  identitiesToCreate: number;
  versionsToAttach: number;
  orphanIdentityCount: number;
};

function resolveIdentity(
  sId: string,
  configurations: AgentConfigurationModel[],
  identitiesById: Map<number, AgentModel>,
  identitiesBySId: Map<string, AgentModel>
): AgentModel | null {
  const linkedIds = new Set(
    configurations.flatMap(({ agentId }) => (agentId === null ? [] : [agentId]))
  );
  if (linkedIds.size > 1) {
    throw new Error(`Agent ${sId} is linked to multiple identities.`);
  }

  const linkedId = linkedIds.values().next().value;
  const linkedIdentity =
    linkedId === undefined ? undefined : identitiesById.get(linkedId);
  if (linkedId !== undefined && linkedIdentity?.sId !== sId) {
    throw new Error(`Agent ${sId} is linked to an invalid identity.`);
  }

  const identity = identitiesBySId.get(sId);
  if (linkedId !== undefined && identity?.id !== linkedId) {
    throw new Error(`Agent ${sId} has inconsistent identity links.`);
  }

  return identity ?? null;
}

export async function backfillAgentIdentities({
  execute,
  logger,
  workspace,
}: {
  execute: boolean;
  logger: Logger;
  workspace: MigrationWorkspace;
}): Promise<AgentIdentityBackfillStats> {
  // Load each indexed workspace slice once, then validate and group it in memory to avoid
  // per-agent reads before the writes below.
  const [configurations, identities] = await Promise.all([
    AgentConfigurationModel.findAll({
      where: { workspaceId: workspace.id },
      attributes: ["agentId", "sId"],
    }),
    AgentModel.findAll({
      where: { workspaceId: workspace.id },
      attributes: ["id", "sId"],
    }),
  ]);

  const configurationsBySId = new Map<string, AgentConfigurationModel[]>();
  for (const configuration of configurations) {
    const versions = configurationsBySId.get(configuration.sId) ?? [];
    versions.push(configuration);
    configurationsBySId.set(configuration.sId, versions);
  }

  const identitiesById = new Map(identities.map((agent) => [agent.id, agent]));
  const identitiesBySId = new Map(
    identities.map((agent) => [agent.sId, agent])
  );
  const stats: AgentIdentityBackfillStats = {
    logicalAgentCount: configurationsBySId.size,
    identitiesToCreate: 0,
    versionsToAttach: 0,
    orphanIdentityCount: identities.filter(
      ({ sId }) => !configurationsBySId.has(sId)
    ).length,
  };

  await concurrentExecutor(
    [...configurationsBySId],
    async ([sId, versions]) => {
      const currentIdentity = resolveIdentity(
        sId,
        versions,
        identitiesById,
        identitiesBySId
      );
      const versionsToAttach = versions.filter(
        ({ agentId }) => agentId === null
      ).length;
      stats.identitiesToCreate += currentIdentity ? 0 : 1;
      stats.versionsToAttach += versionsToAttach;

      if (!execute || versionsToAttach === 0) {
        return;
      }

      await withTransaction(async (transaction) => {
        const [identity] = await AgentModel.findOrCreate({
          where: { sId, workspaceId: workspace.id },
          defaults: { sId, workspaceId: workspace.id },
          transaction,
        });
        await AgentConfigurationModel.update(
          { agentId: identity.id },
          {
            where: {
              sId,
              workspaceId: workspace.id,
              [Op.and]: literal('"agentId" IS NULL'),
            },
            transaction,
          }
        );
      });
    },
    { concurrency: 4 }
  );

  if (execute) {
    const missingIdentityCount = await AgentConfigurationModel.count({
      where: {
        workspaceId: workspace.id,
        [Op.and]: literal('"agentId" IS NULL'),
      },
    });
    if (missingIdentityCount > 0) {
      throw new Error(
        `Workspace ${workspace.sId} still has ${missingIdentityCount} versions without an identity.`
      );
    }
  }

  logger.info(
    { workspaceId: workspace.sId, execute, ...stats },
    "Agent identity backfill completed for workspace"
  );
  return stats;
}

if (process.argv[1]?.endsWith("20260828_backfill_agent_identities.ts")) {
  makeScript(
    { wId: { type: "string", required: false } },
    async ({ execute, wId }, logger) => {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillAgentIdentities({ execute, logger, workspace });
        },
        { concurrency: 4, wId }
      );
    }
  );
}
