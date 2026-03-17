import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import {
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

const getConversationDependencyKey = ({
  conversationId,
  agentConfigurationId,
}: Pick<
  ConversationMCPServerViewModel,
  "conversationId" | "agentConfigurationId"
>) => `${conversationId}:${agentConfigurationId ?? "null"}`;

const getSkillDependencyKey = ({
  skillConfigurationId,
}: Pick<SkillMCPServerConfigurationModel, "skillConfigurationId">) =>
  `${skillConfigurationId}`;

const remapMCPServerViewIds = (
  mcpServerViewIds: ModelId[],
  fromMCPServerViewIdSet: Set<ModelId>,
  toMCPServerViewId: ModelId
) => {
  const remappedMCPServerViewIds: ModelId[] = [];
  const seenMCPServerViewIds = new Set<ModelId>();

  for (const mcpServerViewId of mcpServerViewIds) {
    const nextMCPServerViewId = fromMCPServerViewIdSet.has(mcpServerViewId)
      ? toMCPServerViewId
      : mcpServerViewId;

    if (seenMCPServerViewIds.has(nextMCPServerViewId)) {
      continue;
    }

    remappedMCPServerViewIds.push(nextMCPServerViewId);
    seenMCPServerViewIds.add(nextMCPServerViewId);
  }

  return remappedMCPServerViewIds;
};

export const reassignMCPServerViewDependencies = async (
  auth: Authenticator,
  {
    fromMCPServerViewIds,
    toMCPServerViewId,
    transaction,
  }: {
    fromMCPServerViewIds: ModelId[];
    toMCPServerViewId: ModelId;
    transaction?: Transaction;
  }
) => {
  if (fromMCPServerViewIds.length === 0) {
    return;
  }

  const workspaceId = auth.getNonNullableWorkspace().id;
  const referencedMCPServerViewIds = [
    toMCPServerViewId,
    ...fromMCPServerViewIds,
  ];
  const fromMCPServerViewIdSet = new Set(fromMCPServerViewIds);

  await AgentMCPServerConfigurationModel.update(
    { mcpServerViewId: toMCPServerViewId },
    {
      where: {
        workspaceId,
        mcpServerViewId: { [Op.in]: fromMCPServerViewIds },
      },
      transaction,
    }
  );

  const conversationDependencies = await ConversationMCPServerViewModel.findAll(
    {
      where: {
        workspaceId,
        mcpServerViewId: { [Op.in]: referencedMCPServerViewIds },
      },
      order: [
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
      transaction,
    }
  );

  const conversationDependencyMap = new Map<
    string,
    ConversationMCPServerViewModel[]
  >();
  for (const dependency of conversationDependencies) {
    const key = getConversationDependencyKey(dependency);
    const existingDependencies = conversationDependencyMap.get(key) ?? [];
    conversationDependencyMap.set(key, [...existingDependencies, dependency]);
  }

  const conversationDependencyIdsToDelete: ModelId[] = [];
  const conversationDependencyIdsToUpdate: ModelId[] = [];
  for (const dependencies of conversationDependencyMap.values()) {
    const targetDependencies = dependencies.filter(
      (dependency) => dependency.mcpServerViewId === toMCPServerViewId
    );

    if (targetDependencies.length > 0) {
      const [keptTargetDependency, ...duplicatedTargetDependencies] =
        targetDependencies;
      conversationDependencyIdsToDelete.push(
        ...duplicatedTargetDependencies.map((dependency) => dependency.id),
        ...dependencies
          .filter(
            (dependency) =>
              dependency.id !== keptTargetDependency.id &&
              fromMCPServerViewIdSet.has(dependency.mcpServerViewId)
          )
          .map((dependency) => dependency.id)
      );
      continue;
    }

    const [dependencyToUpdate, ...dependenciesToDelete] = dependencies;
    if (fromMCPServerViewIdSet.has(dependencyToUpdate.mcpServerViewId)) {
      conversationDependencyIdsToUpdate.push(dependencyToUpdate.id);
    }
    conversationDependencyIdsToDelete.push(
      ...dependenciesToDelete.map((dependency) => dependency.id)
    );
  }

  if (conversationDependencyIdsToUpdate.length > 0) {
    await ConversationMCPServerViewModel.update(
      { mcpServerViewId: toMCPServerViewId },
      {
        where: {
          workspaceId,
          id: { [Op.in]: conversationDependencyIdsToUpdate },
        },
        transaction,
      }
    );
  }

  if (conversationDependencyIdsToDelete.length > 0) {
    await ConversationMCPServerViewModel.destroy({
      where: {
        workspaceId,
        id: { [Op.in]: conversationDependencyIdsToDelete },
      },
      transaction,
    });
  }

  const skillDependencies = await SkillMCPServerConfigurationModel.findAll({
    where: {
      workspaceId,
      mcpServerViewId: { [Op.in]: referencedMCPServerViewIds },
    },
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"],
    ],
    transaction,
  });

  const skillDependencyMap = new Map<
    string,
    SkillMCPServerConfigurationModel[]
  >();
  for (const dependency of skillDependencies) {
    const key = getSkillDependencyKey(dependency);
    const existingDependencies = skillDependencyMap.get(key) ?? [];
    skillDependencyMap.set(key, [...existingDependencies, dependency]);
  }

  const skillDependencyIdsToDelete: ModelId[] = [];
  const skillDependencyIdsToUpdate: ModelId[] = [];
  for (const dependencies of skillDependencyMap.values()) {
    const targetDependencies = dependencies.filter(
      (dependency) => dependency.mcpServerViewId === toMCPServerViewId
    );

    if (targetDependencies.length > 0) {
      const [keptTargetDependency, ...duplicatedTargetDependencies] =
        targetDependencies;
      skillDependencyIdsToDelete.push(
        ...duplicatedTargetDependencies.map((dependency) => dependency.id),
        ...dependencies
          .filter(
            (dependency) =>
              dependency.id !== keptTargetDependency.id &&
              fromMCPServerViewIdSet.has(dependency.mcpServerViewId)
          )
          .map((dependency) => dependency.id)
      );
      continue;
    }

    const [dependencyToUpdate, ...dependenciesToDelete] = dependencies;
    if (fromMCPServerViewIdSet.has(dependencyToUpdate.mcpServerViewId)) {
      skillDependencyIdsToUpdate.push(dependencyToUpdate.id);
    }
    skillDependencyIdsToDelete.push(
      ...dependenciesToDelete.map((dependency) => dependency.id)
    );
  }

  if (skillDependencyIdsToUpdate.length > 0) {
    await SkillMCPServerConfigurationModel.update(
      { mcpServerViewId: toMCPServerViewId },
      {
        where: {
          workspaceId,
          id: { [Op.in]: skillDependencyIdsToUpdate },
        },
        transaction,
      }
    );
  }

  if (skillDependencyIdsToDelete.length > 0) {
    await SkillMCPServerConfigurationModel.destroy({
      where: {
        workspaceId,
        id: { [Op.in]: skillDependencyIdsToDelete },
      },
      transaction,
    });
  }

  const skillVersions = await SkillVersionModel.findAll({
    where: {
      workspaceId,
    },
    transaction,
  });

  for (const skillVersion of skillVersions) {
    if (
      !skillVersion.mcpServerViewIds.some((mcpServerViewId) =>
        fromMCPServerViewIdSet.has(mcpServerViewId)
      )
    ) {
      continue;
    }

    const remappedMCPServerViewIds = remapMCPServerViewIds(
      skillVersion.mcpServerViewIds,
      fromMCPServerViewIdSet,
      toMCPServerViewId
    );

    skillVersion.mcpServerViewIds = remappedMCPServerViewIds;
    await skillVersion.save({ transaction });
  }
};

export const destroyMCPServerViewDependencies = async (
  auth: Authenticator,
  {
    mcpServerViewId,
    transaction,
  }: {
    mcpServerViewId: ModelId;
    transaction?: Transaction;
  }
) => {
  // Delete all dependencies.
  const agentConfigurationIds = (
    await AgentMCPServerConfigurationModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        mcpServerViewId: mcpServerViewId,
      },
      transaction,
    })
  ).map((view: AgentMCPServerConfigurationModel) => view.id);

  await AgentDataSourceConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentTablesQueryConfigurationTableModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentChildAgentConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentMCPServerConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewId,
    },
    transaction,
  });

  await ConversationMCPServerViewModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewId,
    },
    transaction,
  });

  await SkillMCPServerConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewId,
    },
    transaction,
  });
};
