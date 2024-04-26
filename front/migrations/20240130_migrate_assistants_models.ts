import { GPT_4_TURBO_MODEL_ID } from "@dust-tt/types";
import { Err } from "@dust-tt/types";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";

const { LIVE, WORKSPACE } = process.env;

// Do not use this migration. Instead, use script/update_assistants_models.ts.

// GPT-4 and GPT-4-32k are being replaced by GPT-4-1106-preview
const FROM_MODELS = ["gpt-4-1106-preview"] as string[];
const TO_MODEL = GPT_4_TURBO_MODEL_ID;

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

  for (const agent of agentConfigurations) {
    if (FROM_MODELS.includes(agent.modelId)) {
      if (LIVE) {
        const oldModel = agent.modelId;
        await agent.update({ modelId: TO_MODEL });
        console.log(
          "Updated",
          agent.sId,
          agent.name,
          "from " + oldModel + " to " + TO_MODEL
        );
      } else {
        console.log(
          "Would update",
          agent.sId,
          agent.name,
          "from " + agent.modelId + " to " + TO_MODEL
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
