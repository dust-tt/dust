import type { ModelId, SupportedModel } from "@dust-tt/types";
import { SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";

import {
  AgentConfiguration,
  AgentGenerationConfiguration,
  Workspace,
} from "@app/lib/models";
import { makeScript } from "@app/scripts/helpers";

type SupportedModelIds = SupportedModel["modelId"];

async function updateWorkspaceAssistants(
  workspaceId: ModelId,
  fromModel: string,
  toModel: SupportedModelIds,
  execute: boolean
) {
  const agentConfigurations = await AgentConfiguration.findAll({
    where: { workspaceId },
  });

  for (const ac of agentConfigurations) {
    if (!ac.generationConfigurationId) {
      console.log(
        `Skipping  ${ac.name}(${ac.sId}): (no generation configuration).`
      );
      continue;
    }

    const generationConfiguration = await AgentGenerationConfiguration.findOne({
      where: { id: ac.generationConfigurationId },
    });

    if (!generationConfiguration) {
      throw new Error(
        `Generation configuration ${ac.generationConfigurationId} not found.`
      );
    }

    if (generationConfiguration.modelId === fromModel) {
      if (execute) {
        await generationConfiguration.update({ modelId: toModel });
      }

      console.log(
        `${execute ? "" : "[DRYRUN]"} Updated ${ac.name}(${ac.sId}) from ${
          generationConfiguration.modelId
        } to ${toModel}.`
      );
    }
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
