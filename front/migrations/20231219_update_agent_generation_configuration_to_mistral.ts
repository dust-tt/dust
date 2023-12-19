import { MISTRAL_SMALL_MODEL_ID } from "@dust-tt/types";
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

  const agentGenerationConfiguration =
    await front_sequelize.query<AgentGenerationConfigurationRow>(
      `SELECT id, "providerId", "modelId" from agent_generation_configurations WHERE "providerId" = 'textsynth' AND "modelId" = 'mistral_7B_instruct'`,
      { type: QueryTypes.SELECT }
    );

  console.log(
    `Found ${agentGenerationConfiguration.length} agent generation configuration to process`
  );

  const chunks = [];
  for (let i = 0; i < agentGenerationConfiguration.length; i += 32) {
    chunks.push(agentGenerationConfiguration.slice(i, i + 32));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map(async (d) => {
        return processAgentGenerationConfiguration(front_sequelize, d);
      })
    );
  }
}

async function processAgentGenerationConfiguration(
  front_sequelize: Sequelize,
  d: AgentGenerationConfigurationRow
) {
  if (LIVE) {
    await front_sequelize.query(
      `UPDATE agent_generation_configurations SET providerId = :providerId AND modelId = :modelId WHERE id = :id`,
      {
        replacements: {
          id: d.id,
          modelId: "mistral",
          providerId: MISTRAL_SMALL_MODEL_ID,
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
