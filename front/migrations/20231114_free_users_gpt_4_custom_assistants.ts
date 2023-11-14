import { front_sequelize } from "@app/lib/databases";
import { AgentGenerationConfiguration } from "@app/lib/models";

const { LIVE } = process.env;

async function main() {
  const generationConfigIdsRes = await front_sequelize.query(
    `
    SELECT agc.id FROM
      agent_configurations ac
      INNER JOIN agent_generation_configurations agc on ac."generationConfigurationId" = agc.id
    WHERE
      agc."modelId" LIKE '%gpt-4%'
      AND ac."workspaceId" IN (SELECT ws.id FROM
        workspaces ws
      LEFT JOIN
        subscriptions ON ws.id = subscriptions."workspaceId"
      WHERE
        subscriptions.id IS NULL)
    `
  );

  const generationConfigIds = generationConfigIdsRes[0].map((g: any) => g.id);

  console.log(`Found ${generationConfigIds.length} agents to update`);

  if (LIVE) {
    await AgentGenerationConfiguration.update(
      { modelId: "gpt-3.5-turbo" },
      { where: { id: generationConfigIds } }
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
