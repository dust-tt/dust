import {
  AgentConfiguration,
  AgentGenerationConfiguration,
  Workspace,
} from "@app/lib/models";
import { Err } from "@app/lib/result";

const { LIVE, WORKSPACE } = process.env;

async function updateWorkspaceAssistants(wId: string) {
  console.log(`Updateing agents for workspace ${wId}...`);

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

    if (g.modelId === "gpt-4" || g.modelId === "gpt-4-32k") {
      if (LIVE) {
        const oldModel = g.modelId;
        await g.update({ modelId: "gpt-4-1106-preview" });
        console.log("Updated", c.sId, c.name, "from " + oldModel);
      } else {
        console.log("Would update", c.sId, c.name, "from " + g.modelId);
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
