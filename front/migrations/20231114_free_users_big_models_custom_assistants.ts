import { front_sequelize } from "@app/lib/databases";
import { AgentGenerationConfiguration } from "@app/lib/models";

const { LIVE } = process.env;

async function main() {
  console.log("Updating GPT-4 agents...");
  const gpt4GenerationConfigIdsRes = await front_sequelize.query(
    `
    SELECT agc.id FROM
      agent_configurations ac
      INNER JOIN agent_generation_configurations agc on ac."generationConfigurationId" = agc.id
    WHERE
      agc."modelId" LIKE '%gpt-4%'
      AND ac."workspaceId" IN (
        SELECT ws.id FROM
          workspaces ws
        LEFT JOIN
          subscriptions ON ws.id = subscriptions."workspaceId"
        WHERE
          subscriptions.id IS NULL
      )
    `
  );

  const gpt4GenerationConfigIds = gpt4GenerationConfigIdsRes[0].map(
    (g: any) => g.id
  );

  console.log(`Found ${gpt4GenerationConfigIds.length} GPT-4 agents to update`);

  if (LIVE) {
    await AgentGenerationConfiguration.update(
      { modelId: "gpt-3.5-turbo" },
      { where: { id: gpt4GenerationConfigIds } }
    );
  }

  console.log("Updating claude-2 agents...");

  const claude2GenerationConfigIdsRes = await front_sequelize.query(
    `
    SELECT agc.id FROM
      agent_configurations ac
      INNER JOIN agent_generation_configurations agc on ac."generationConfigurationId" = agc.id
    WHERE
      agc."modelId" LIKE '%claude-2%'
      AND ac."workspaceId" IN (
        SELECT ws.id FROM
          workspaces ws
        LEFT JOIN
          subscriptions ON ws.id = subscriptions."workspaceId"
        WHERE
          subscriptions.id IS NULL
      )
    `
  );

  const claude2GenerationConfigIds = claude2GenerationConfigIdsRes[0].map(
    (g: any) => g.id
  );

  console.log(
    `Found ${claude2GenerationConfigIds.length} Claude-2 agents to update`
  );

  if (LIVE) {
    await AgentGenerationConfiguration.update(
      { modelId: "claude-instant-1.2" },
      { where: { id: claude2GenerationConfigIds } }
    );
  }

  console.log("Done");
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
