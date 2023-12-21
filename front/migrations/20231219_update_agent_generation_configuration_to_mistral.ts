import { MISTRAL_SMALL_MODEL_ID } from "@dust-tt/types";
import assert from "assert";
import { QueryTypes, Sequelize } from "sequelize";

// To be run from connectors with `FRONT_DATABASE_URI`.
const { FRONT_DATABASE_URI, LIVE = false } = process.env;

interface AgentGenerationConfigurationRow {
  id: number;
}

async function main() {
  const front_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
    logging: false,
  });

  const agentGenerationConfigurations =
    await front_sequelize.query<AgentGenerationConfigurationRow>(
      `SELECT id, "providerId", "modelId" from agent_generation_configurations WHERE "providerId" = 'textsynth' AND "modelId" = 'mistral_7B_instruct'`,
      { type: QueryTypes.SELECT }
    );

  console.log(
    `Found ${agentGenerationConfigurations.length} agent generation configuration to process`
  );

  assert(agentGenerationConfigurations.length < 100);

  for (const [index, agentConfig] of Object.entries(
    agentGenerationConfigurations
  )) {
    console.log(
      `Processing row ${index}/${agentGenerationConfigurations.length}...`
    );

    await processAgentGenerationConfiguration(front_sequelize, agentConfig);
  }
}

async function processAgentGenerationConfiguration(
  front_sequelize: Sequelize,
  agentConfig: AgentGenerationConfigurationRow
) {
  if (LIVE) {
    await front_sequelize.query(
      `UPDATE agent_generation_configurations SET "providerId" = :providerId, "modelId" = :modelId WHERE id = :id`,
      {
        replacements: {
          id: agentConfig.id,
          modelId: MISTRAL_SMALL_MODEL_ID,
          providerId: "mistral",
        },
      }
    );
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
