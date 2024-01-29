import {
  GPT_4_TURBO_MODEL_ID,
  GPT_4_TURBO_PREVIEW_MODEL_ID,
} from "@dust-tt/types";
import { Err } from "@dust-tt/types";

import {
  AgentConfiguration,
  AgentGenerationConfiguration,
  Workspace,
} from "@app/lib/models";

const { LIVE, WORKSPACE } = process.env;

// GPT-4 and GPT-4-32k are being replaced by GPT-4-1106-preview
const FROM_MODELS = [GPT_4_TURBO_MODEL_ID] as string[];
const TO_MODEL = GPT_4_TURBO_PREVIEW_MODEL_ID;

// GPT-3.5 Turbo and GPT-3.5 Turbo 16k are being replaced by GPT-3.5 Turbo 1106
// const FROM_MODELS = ["gpt-3.5-turbo", "gpt-3.5-turbo-16k"];
// const TO_MODEL = GPT_3_5_TURBO_MODEL_ID;

// claude-2 are being replaced by claude-2.1
// const FROM_MODELS = ["claude-2"];
// const TO_MODEL = CLAUDE_2_1_MODEL_ID;

async function updateWorkspaceAssistants(wId: string) {
  // console.log(`Updating agents for workspace ${wId}...`);

  const w = await Workspace.findOne({ where: { sId: wId } });
  if (!w) {
    throw new Error(`Workspace ${wId} not found`);
  }

  const agentConfigurations = await AgentConfiguration.findAll({
    where: { workspaceId: w.id },
  });

  for (const c of agentConfigurations) {
    if (!c.generationConfigurationId) {
      console.log(
        "Skipping agent (no generation configuration)",
        c.sId,
        c.name
      );
      continue;
    }

    const g = await AgentGenerationConfiguration.findOne({
      where: { id: c.generationConfigurationId },
    });

    if (!g) {
      throw new Error(
        `Generation configuration ${c.generationConfigurationId} not found`
      );
    }

    if (FROM_MODELS.includes(g.modelId)) {
      if (LIVE) {
        const oldModel = g.modelId;
        await g.update({ modelId: TO_MODEL });
        console.log(
          "Updated",
          c.sId,
          c.name,
          "from " + oldModel + " to " + TO_MODEL
        );
      } else {
        console.log(
          "Would update",
          c.sId,
          c.name,
          "from " + g.modelId + " to " + TO_MODEL
        );
      }
    }
  }
}

async function main() {
  if (!WORKSPACE) {
    throw new Err("WORKSPACE is required");
  }
  const wId = WORKSPACE;

  if (wId === "all") {
    const workspaces = await Workspace.findAll();

    const chunks = [];
    for (let i = 0; i < workspaces.length; i += 32) {
      chunks.push(workspaces.slice(i, i + 32));
    }

    for (let i = 0; i < chunks.length; i++) {
      console.log(`Processing chunk ${i}/${chunks.length}...`);
      const chunk = chunks[i];
      await Promise.all(
        chunk.map(async (w) => {
          return updateWorkspaceAssistants(w.sId);
        })
      );
    }
  } else {
    await updateWorkspaceAssistants(wId);
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
