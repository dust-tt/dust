import type { ModelId, SupportedModel } from "@dust-tt/types";
import { SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";

import {
  AgentConfiguration,
  AgentGenerationConfiguration,
} from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
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
    const generationConfigurations = await AgentGenerationConfiguration.findAll(
      {
        where: { agentConfigurationId: ac.id },
      }
    );

    if (generationConfigurations.length === 0) {
      console.log(
        `Skipping  ${ac.name}(${ac.sId}): (no generation configuration).`
      );
      continue;
    }

    for (const generationConfiguration of generationConfigurations) {
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
