import {
  AgentConfiguration,
  AgentGenerationConfiguration,
  Workspace,
} from "@app/lib/models";
import { Err } from "@app/lib/result";

const { LIVE, WORKSPACE } = process.env;

async function main() {
  if (!WORKSPACE) {
    throw new Err("WORKSPACE is required");
  }
  const wId = WORKSPACE;

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
        await g.update({ modelId: "gpt-4-1106-preview" });
        console.log("Updated", c.sId, c.name);
      } else {
        console.log("Would update", c.sId, c.name);
      }
    }
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
