import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId, SupportedModel } from "@app/types";
import { isSupportedModel, SUPPORTED_MODEL_CONFIGS } from "@app/types";

type SupportedModelIds = SupportedModel["modelId"];

async function updateWorkspaceAssistants(
  workspaceId: ModelId,
  fromModel: string,
  toModel: SupportedModelIds,
  execute: boolean,
  onlyActive: boolean,
  forceProviderChange: boolean,
) {
  const whereClause: any = { workspaceId, modelId: fromModel };
  if (onlyActive) {
    whereClause.status = "active";
  }

  const agentConfigurations = await AgentConfiguration.findAll({
    where: whereClause,
  });

  console.log(
    `Found ${agentConfigurations.length} ${
      onlyActive ? "active " : ""
    }agent configurations with model ${fromModel} in workspace ${workspaceId}`
  );

  for (const agent of agentConfigurations) {
    if (!isSupportedModel({ modelId: toModel, providerId: agent.providerId }, !forceProviderChange)) {
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
        (providerChanged ? ` (provider: ${agent.providerId} -> ${targetProviderId})` : "") +
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
      description: "Allow switching provider to match the target model. When false, only models from the same provider are allowed. It is a safety mechanism to avoid unexpected provider changes.",
    },
  },
  async ({ fromModel, toModel, workspaceIds, execute, onlyActive, forceProviderChange }) => {
    const whereClause = workspaceIds.length > 0 ? { sId: workspaceIds } : {};
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
        onlyActive,
        forceProviderChange,
      );
    }
  }
);
