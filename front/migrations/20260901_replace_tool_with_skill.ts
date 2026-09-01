import type { Logger } from "@app/logger/logger";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  getResourceNameAndIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";

type SkillLinkTarget =
  | { customSkillId: ModelId; globalSkillId: null }
  | { customSkillId: null; globalSkillId: string };

interface DependentConfigurationCounts {
  childAgent: number;
  dataSource: number;
  project: number;
  table: number;
}

interface AgentChange {
  agent: AgentConfigurationModel;
  dependentConfigurationCounts: DependentConfigurationCounts;
  hasSkill: boolean;
  toolConfigurations: AgentMCPServerConfigurationModel[];
}

interface ReplacementPlan {
  agentChanges: AgentChange[];
  dependentConfigurationCounts: DependentConfigurationCounts;
  toolConfigurationIds: ModelId[];
}

interface DependentConfigurationReference {
  mcpServerConfigurationId: ModelId | null;
}

function getSkillLinkTarget(skill: SkillResource): SkillLinkTarget {
  return isResourceSId("skill", skill.sId)
    ? { customSkillId: skill.id, globalSkillId: null }
    : { customSkillId: null, globalSkillId: skill.sId };
}

function countByAgentConfiguration(
  references: DependentConfigurationReference[],
  agentConfigurationIdByToolConfigurationId: Map<ModelId, ModelId>
): Map<ModelId, number> {
  const counts = new Map<ModelId, number>();

  for (const reference of references) {
    if (reference.mcpServerConfigurationId === null) {
      throw new Error(
        "Found a dependent configuration without a tool configuration."
      );
    }

    const agentConfigurationId = agentConfigurationIdByToolConfigurationId.get(
      reference.mcpServerConfigurationId
    );
    if (agentConfigurationId === undefined) {
      throw new Error(
        `Missing agent configuration for tool configuration ${reference.mcpServerConfigurationId}.`
      );
    }

    counts.set(
      agentConfigurationId,
      (counts.get(agentConfigurationId) ?? 0) + 1
    );
  }

  return counts;
}

function sumDependentConfigurationCounts(
  agentChanges: AgentChange[]
): DependentConfigurationCounts {
  return agentChanges.reduce<DependentConfigurationCounts>(
    (totals, change) => ({
      childAgent:
        totals.childAgent + change.dependentConfigurationCounts.childAgent,
      dataSource:
        totals.dataSource + change.dependentConfigurationCounts.dataSource,
      project: totals.project + change.dependentConfigurationCounts.project,
      table: totals.table + change.dependentConfigurationCounts.table,
    }),
    { childAgent: 0, dataSource: 0, project: 0, table: 0 }
  );
}

async function buildReplacementPlan(
  {
    mcpServerViewModelId,
    skillLinkTarget,
    workspaceModelId,
  }: {
    mcpServerViewModelId: ModelId;
    skillLinkTarget: SkillLinkTarget;
    workspaceModelId: ModelId;
  },
  transaction?: Transaction
): Promise<ReplacementPlan> {
  // Intentionally include every agent configuration status so drafts or pending versions cannot
  // reintroduce the tool later. The dry run reports each status and version explicitly.
  const toolConfigurations = await AgentMCPServerConfigurationModel.findAll({
    attributes: ["id", "sId", "agentConfigurationId"],
    where: {
      mcpServerViewId: mcpServerViewModelId,
      workspaceId: workspaceModelId,
    },
    transaction,
  });

  if (toolConfigurations.length === 0) {
    return {
      agentChanges: [],
      dependentConfigurationCounts: {
        childAgent: 0,
        dataSource: 0,
        project: 0,
        table: 0,
      },
      toolConfigurationIds: [],
    };
  }

  const agentConfigurationIds = [
    ...new Set(
      toolConfigurations.map(
        (configuration) => configuration.agentConfigurationId
      )
    ),
  ];
  const toolConfigurationIds = toolConfigurations.map(
    (configuration) => configuration.id
  );
  const dependentConfigurationWhere = {
    mcpServerConfigurationId: { [Op.in]: toolConfigurationIds },
    workspaceId: workspaceModelId,
  };

  const [
    agents,
    existingSkillLinks,
    childAgentConfigurations,
    dataSourceConfigurations,
    projectConfigurations,
    tableConfigurations,
  ] = await Promise.all([
    AgentConfigurationModel.findAll({
      attributes: ["id", "sId", "name", "status", "version"],
      where: {
        id: { [Op.in]: agentConfigurationIds },
        workspaceId: workspaceModelId,
      },
      transaction,
    }),
    AgentSkillModel.findAll({
      attributes: ["agentConfigurationId"],
      where: {
        agentConfigurationId: { [Op.in]: agentConfigurationIds },
        ...skillLinkTarget,
        workspaceId: workspaceModelId,
      },
      transaction,
    }),
    AgentChildAgentConfigurationModel.findAll({
      attributes: ["mcpServerConfigurationId"],
      where: dependentConfigurationWhere,
      transaction,
    }),
    AgentDataSourceConfigurationModel.findAll({
      attributes: ["mcpServerConfigurationId"],
      where: dependentConfigurationWhere,
      transaction,
    }),
    AgentProjectConfigurationModel.findAll({
      attributes: ["mcpServerConfigurationId"],
      where: dependentConfigurationWhere,
      transaction,
    }),
    AgentTablesQueryConfigurationTableModel.findAll({
      attributes: ["mcpServerConfigurationId"],
      where: dependentConfigurationWhere,
      transaction,
    }),
  ]);

  const agentsByModelId = new Map(agents.map((agent) => [agent.id, agent]));
  const toolConfigurationsByAgentModelId = new Map<
    ModelId,
    AgentMCPServerConfigurationModel[]
  >();
  const agentConfigurationIdByToolConfigurationId = new Map<ModelId, ModelId>();

  for (const toolConfiguration of toolConfigurations) {
    const agentConfigurationId = toolConfiguration.agentConfigurationId;
    const currentConfigurations =
      toolConfigurationsByAgentModelId.get(agentConfigurationId) ?? [];

    toolConfigurationsByAgentModelId.set(agentConfigurationId, [
      ...currentConfigurations,
      toolConfiguration,
    ]);
    agentConfigurationIdByToolConfigurationId.set(
      toolConfiguration.id,
      agentConfigurationId
    );
  }

  const childAgentCounts = countByAgentConfiguration(
    childAgentConfigurations,
    agentConfigurationIdByToolConfigurationId
  );
  const dataSourceCounts = countByAgentConfiguration(
    dataSourceConfigurations,
    agentConfigurationIdByToolConfigurationId
  );
  const projectCounts = countByAgentConfiguration(
    projectConfigurations,
    agentConfigurationIdByToolConfigurationId
  );
  const tableCounts = countByAgentConfiguration(
    tableConfigurations,
    agentConfigurationIdByToolConfigurationId
  );
  const agentConfigurationIdsWithSkill = new Set(
    existingSkillLinks.map((link) => link.agentConfigurationId)
  );

  const agentChanges = agentConfigurationIds
    .map((agentConfigurationId): AgentChange => {
      const agent = agentsByModelId.get(agentConfigurationId);
      if (!agent) {
        throw new Error(
          `Agent configuration ${agentConfigurationId} referenced by the tool was not found.`
        );
      }

      return {
        agent,
        dependentConfigurationCounts: {
          childAgent: childAgentCounts.get(agentConfigurationId) ?? 0,
          dataSource: dataSourceCounts.get(agentConfigurationId) ?? 0,
          project: projectCounts.get(agentConfigurationId) ?? 0,
          table: tableCounts.get(agentConfigurationId) ?? 0,
        },
        hasSkill: agentConfigurationIdsWithSkill.has(agentConfigurationId),
        toolConfigurations:
          toolConfigurationsByAgentModelId.get(agentConfigurationId) ?? [],
      };
    })
    .sort(
      (left, right) =>
        left.agent.name.localeCompare(right.agent.name) ||
        left.agent.sId.localeCompare(right.agent.sId) ||
        left.agent.version - right.agent.version
    );

  return {
    agentChanges,
    dependentConfigurationCounts: sumDependentConfigurationCounts(agentChanges),
    toolConfigurationIds,
  };
}

async function applyReplacementPlan(
  {
    plan,
    skillLinkTarget,
    workspaceModelId,
  }: {
    plan: ReplacementPlan;
    skillLinkTarget: SkillLinkTarget;
    workspaceModelId: ModelId;
  },
  transaction: Transaction
): Promise<void> {
  if (plan.toolConfigurationIds.length === 0) {
    return;
  }

  const agentConfigurationIdsToLink = plan.agentChanges
    .filter((change) => !change.hasSkill)
    .map((change) => change.agent.id);

  if (agentConfigurationIdsToLink.length > 0) {
    await AgentSkillModel.bulkCreate(
      agentConfigurationIdsToLink.map((agentConfigurationId) => ({
        agentConfigurationId,
        ...skillLinkTarget,
        workspaceId: workspaceModelId,
      })),
      { transaction }
    );
  }

  const dependentConfigurationWhere = {
    mcpServerConfigurationId: { [Op.in]: plan.toolConfigurationIds },
    workspaceId: workspaceModelId,
  };

  await AgentChildAgentConfigurationModel.destroy({
    where: dependentConfigurationWhere,
    transaction,
  });
  await AgentDataSourceConfigurationModel.destroy({
    where: dependentConfigurationWhere,
    transaction,
  });
  await AgentProjectConfigurationModel.destroy({
    where: dependentConfigurationWhere,
    transaction,
  });
  await AgentTablesQueryConfigurationTableModel.destroy({
    where: dependentConfigurationWhere,
    transaction,
  });

  const removedToolConfigurationCount =
    await AgentMCPServerConfigurationModel.destroy({
      where: {
        id: { [Op.in]: plan.toolConfigurationIds },
        workspaceId: workspaceModelId,
      },
      transaction,
    });

  if (removedToolConfigurationCount !== plan.toolConfigurationIds.length) {
    throw new Error(
      `Expected to remove ${plan.toolConfigurationIds.length} tool configurations, removed ${removedToolConfigurationCount}.`
    );
  }
}

function logAgentChanges(
  {
    execute,
    mcpServerViewId,
    plan,
    skillId,
    workspaceId,
  }: {
    execute: boolean;
    mcpServerViewId: string;
    plan: ReplacementPlan;
    skillId: string;
    workspaceId: string;
  },
  logger: Logger
): void {
  for (const change of plan.agentChanges) {
    logger.info(
      {
        agentConfigurationModelId: change.agent.id,
        agentId: change.agent.sId,
        agentName: change.agent.name,
        agentStatus: change.agent.status,
        agentVersion: change.agent.version,
        changes: {
          addAgentSkillId: change.hasSkill ? null : skillId,
          removeAgentMCPServerConfigurationIds: change.toolConfigurations.map(
            (configuration) => configuration.sId
          ),
          removeDependentConfigurations: change.dependentConfigurationCounts,
          skillAlreadyPresent: change.hasSkill,
        },
        mcpServerViewId,
        workspaceId,
      },
      execute
        ? "Replaced tool with skill on agent"
        : "Dry run: would replace tool with skill on agent"
    );
  }
}

makeScript(
  {
    mcpServerViewId: {
      demandOption: true,
      describe: "MCP server view sId (msv_...) to remove from agents",
      type: "string" as const,
    },
    skillId: {
      demandOption: true,
      describe: "Custom (skl_...) or global skill sId to add to agents",
      type: "string" as const,
    },
  },
  async ({ execute, mcpServerViewId, skillId }, logger) => {
    const parsedMCPServerViewId = getResourceNameAndIdFromSId(mcpServerViewId);
    if (
      !parsedMCPServerViewId ||
      parsedMCPServerViewId.resourceName !== "mcp_server_view"
    ) {
      throw new Error(
        `Invalid MCP server view sId: ${mcpServerViewId}. Expected an msv_... ID.`
      );
    }

    const parsedSkillId = getResourceNameAndIdFromSId(skillId);
    if (parsedSkillId && parsedSkillId.resourceName !== "skill") {
      throw new Error(
        `Invalid skill sId: ${skillId}. Expected a custom skl_... or global skill ID.`
      );
    }
    if (
      parsedSkillId?.resourceName === "skill" &&
      parsedSkillId.workspaceModelId !== parsedMCPServerViewId.workspaceModelId
    ) {
      throw new Error(
        `The MCP server view and custom skill belong to different workspaces.`
      );
    }

    const [workspace] = await WorkspaceResource.fetchByModelIds([
      parsedMCPServerViewId.workspaceModelId,
    ]);
    if (!workspace) {
      throw new Error(
        `Workspace ${parsedMCPServerViewId.workspaceModelId} encoded in ${mcpServerViewId} was not found.`
      );
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      mcpServerViewId,
      { includeDeleted: true }
    );
    if (!mcpServerView) {
      throw new Error(`MCP server view not found: ${mcpServerViewId}.`);
    }

    const [skill] = await SkillResource.fetchByIds(auth, [skillId], {
      onlyActive: true,
      withFileAttachments: false,
      withInstructions: false,
      withTools: false,
    });
    if (!skill) {
      throw new Error(
        `Active skill not found in workspace ${workspace.sId}: ${skillId}.`
      );
    }

    const skillLinkTarget = getSkillLinkTarget(skill);
    const plan = execute
      ? await withTransaction(async (transaction) => {
          const replacementPlan = await buildReplacementPlan(
            {
              mcpServerViewModelId: mcpServerView.id,
              skillLinkTarget,
              workspaceModelId: workspace.id,
            },
            transaction
          );

          await applyReplacementPlan(
            {
              plan: replacementPlan,
              skillLinkTarget,
              workspaceModelId: workspace.id,
            },
            transaction
          );

          return replacementPlan;
        })
      : await buildReplacementPlan({
          mcpServerViewModelId: mcpServerView.id,
          skillLinkTarget,
          workspaceModelId: workspace.id,
        });

    logAgentChanges(
      {
        execute,
        mcpServerViewId,
        plan,
        skillId: skill.sId,
        workspaceId: workspace.sId,
      },
      logger
    );

    logger.info(
      {
        agentConfigurationCount: plan.agentChanges.length,
        agentCount: new Set(plan.agentChanges.map((change) => change.agent.sId))
          .size,
        agentSkillLinksToAdd: plan.agentChanges.filter(
          (change) => !change.hasSkill
        ).length,
        dependentConfigurationsToRemove: plan.dependentConfigurationCounts,
        execute,
        mcpServerViewId,
        skillId: skill.sId,
        toolConfigurationsToRemove: plan.toolConfigurationIds.length,
        workspaceId: workspace.sId,
      },
      execute
        ? "Finished replacing tool with skill"
        : "Dry run: finished listing tool-to-skill changes"
    );
  }
);
