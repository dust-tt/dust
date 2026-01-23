import { Op } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId, SupportedModel } from "@app/types";
import { isSupportedModel, SUPPORTED_MODEL_CONFIGS } from "@app/types";

type SupportedModelIds = SupportedModel["modelId"];
type SelectCriteria = {
  onlyActive: boolean;
  usesResponseFormat: boolean;
};

// Find the workspaceIds that have agentConfigurations using the fromModel and match the selectCriteria.
async function findMatchingWorkspaces(
  fromModel: string,
  selectCriteria: SelectCriteria
): Promise<ModelId[]> {
  const whereClause: any = { modelId: fromModel };
  if (selectCriteria.onlyActive) {
    whereClause.status = "active";
  }
  if (selectCriteria.usesResponseFormat) {
    whereClause.responseFormat = {
      [Op.not]: null,
    };
  }

  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: whereClause,
    attributes: ["workspaceId"],
    raw: true,
    group: ["workspaceId"],
  });

  return agentConfigurations.map((ac) => ac.workspaceId);
}

async function updateWorkspaceAssistants(
  workspaceId: ModelId,
  fromModel: string,
  toModel: SupportedModelIds,
  execute: boolean,
  forceProviderChange: boolean,
  excludeAgentsIds: string[],
  selectCriteria: SelectCriteria
) {
  const whereClause: any = { workspaceId, modelId: fromModel };
  if (selectCriteria.onlyActive) {
    whereClause.status = "active";
  }
  if (selectCriteria.usesResponseFormat) {
    whereClause.responseFormat = {
      [Op.not]: null,
    };
  }

  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: whereClause,
  });

  const agentDescription = `${selectCriteria.onlyActive ? "active " : ""}agent configurations ${selectCriteria.usesResponseFormat ? "with responseFormat set " : ""}using model ${fromModel} in workspace ${workspaceId}`;

  if (agentConfigurations.length !== 0) {
    console.log(`Found ${agentConfigurations.length} ${agentDescription}`);
  } else {
    console.log(`No ${agentDescription}`);
  }

  const excluded = new Set(excludeAgentsIds);

  for (const agent of agentConfigurations) {
    if (excluded.has(agent.sId)) {
      console.log(`[SKIP] ${agent.name} (${agent.sId}) is excluded.`);
      continue;
    }
    if (
      !isSupportedModel(
        { modelId: toModel, providerId: agent.providerId },
        !forceProviderChange
      )
    ) {
      throw new Error(
        `Model ${toModel} is not supported for provider ${agent.providerId}.`
      );
    }

    const targetProviderId = forceProviderChange
      ? SUPPORTED_MODEL_CONFIGS.find((m) => m.modelId === toModel)?.providerId
      : agent.providerId;
    if (execute) {
      await agent.update({ modelId: toModel, providerId: targetProviderId });
    }

    const providerChanged = agent.providerId !== targetProviderId;
    const actionWord = execute ? "Updated" : "[DRYRUN] Would update";
    console.log(
      `${actionWord} ${agent.name} (${agent.sId}) from ${fromModel} to ${toModel}` +
        (providerChanged
          ? ` (provider: ${agent.providerId} -> ${targetProviderId})`
          : "") +
        "."
    );
  }
}

makeScript(
  {
    fromModel: {
      type: "string",
      demandOption: true,
    },
    toModel: {
      type: "string",
      choices: SUPPORTED_MODEL_CONFIGS.map((m) => m.modelId),
      demandOption: true,
    },
    workspaceIds: {
      type: "array",
      coerce: (arr) => arr.map(String),
      demandOption: false,
      default: [],
      description:
        "List of workspace identifiers, separated by a space, for which the agents should be updated.",
    },
    onlyActive: {
      type: "boolean",
      demandOption: false,
      default: false,
      description: "Only update active agent configurations.",
    },
    forceProviderChange: {
      type: "boolean",
      demandOption: false,
      default: false,
      description:
        "Allow switching provider to match the target model. When false, only models from the same provider are allowed. It is a safety mechanism to avoid unexpected provider changes.",
    },
    excludeAgentsIds: {
      type: "array",
      coerce: (arr) => arr.map(String),
      demandOption: false,
      default: [],
      description: "Optional list of agent sIds to exclude from update.",
    },
    usesResponseFormat: {
      type: "boolean",
      demandOption: false,
      default: false,
      description: "Select agents that use response format.",
    },
  },
  async ({
    fromModel,
    toModel,
    workspaceIds,
    execute,
    onlyActive,
    forceProviderChange,
    excludeAgentsIds,
    usesResponseFormat,
  }) => {
    let matchingWorkspaceIds: ModelId[] = [];
    if (workspaceIds.length === 0) {
      matchingWorkspaceIds = await findMatchingWorkspaces(fromModel, {
        onlyActive,
        usesResponseFormat,
      });
    } else {
      const tmp = await WorkspaceModel.findAll({
        attributes: ["id"],
        where: { sId: workspaceIds },
      });
      matchingWorkspaceIds = tmp.map((w) => w.id);
    }

    if (matchingWorkspaceIds.length === 0) {
      console.log(`No workspaces found matching the criteria. Exiting.`);
      return;
    }

    const whereClause = { id: matchingWorkspaceIds };
    const workspaces = await WorkspaceModel.findAll({
      attributes: ["id", "name", "sId"],
      where: whereClause,
    });

    for (const workspace of workspaces) {
      await updateWorkspaceAssistants(
        workspace.id,
        fromModel,
        toModel as SupportedModelIds,
        execute,
        forceProviderChange,
        excludeAgentsIds,
        { onlyActive, usesResponseFormat }
      );
    }
  }
);
