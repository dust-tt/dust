import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId, SupportedModel } from "@app/types";
import { isSupportedModel, SUPPORTED_MODEL_CONFIGS } from "@app/types";

type SupportedModelIds = SupportedModel["modelId"];

async function updateWorkspaceAssistants(
  workspaceId: ModelId,
  fromModel: string,
  toModel: SupportedModelIds,
  execute: boolean
) {
  const agentConfigurations = await AgentConfiguration.findAll({
    where: { workspaceId, modelId: fromModel },
  });

  for (const agent of agentConfigurations) {
    if (!isSupportedModel({ modelId: toModel, providerId: agent.providerId })) {
      throw new Error(
        `Model ${toModel} is not supported for provider ${agent.providerId}.`
      );
    }

    if (execute) {
      await agent.update({ modelId: toModel });
    }

    console.log(
      `${execute ? "" : "[DRYRUN]"} Updated ${agent.name}(${
        agent.sId
      }) from ${fromModel} to ${toModel}.`
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
        "List of workspace identifiers, separated by a space, for which the feature flag should be toggled.",
    },
  },
  async ({ fromModel, toModel, workspaceIds, execute }) => {
    const whereClause = workspaceIds.length > 0 ? { sId: workspaceIds } : {};
    const workspaces = await Workspace.findAll({
      attributes: ["id", "name", "sId"],
      where: whereClause,
    });

    for (const workspace of workspaces) {
      await updateWorkspaceAssistants(
        workspace.id,
        fromModel,
        toModel as SupportedModelIds,
        execute
      );
    }
  }
);
