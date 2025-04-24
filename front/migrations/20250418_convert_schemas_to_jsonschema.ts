import { QueryTypes } from "sequelize";

import type { ProcessSchemaPropertyType } from "@app/lib/actions/process";
import { frontSequelize } from "@app/lib/resources/storage";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1024;

function renderSchemaPropertiesAsJSONSchema(
  schema: ProcessSchemaPropertyType[]
): { type: string; properties: Record<string, object>; required: string[] } {
  let properties: { [name: string]: { type: string; description: string } } =
    {};
  if (schema.length > 0) {
    schema.forEach((f) => {
      properties[f.name] = {
        type: f.type,
        description: f.description,
      };
    });
  } else {
    // Default schema for extraction.
    properties = {
      required_data: {
        type: "string",
        description:
          "Minimal (short and concise) piece of information extracted to follow instructions",
      },
    };
  }

  return {
    type: "object",
    properties: properties,
    required: Object.keys(properties),
  };
}

async function migrateTableSchemas({
  execute,
  logger,
  tableName,
}: {
  execute: boolean;
  logger: typeof Logger;
  tableName: string;
}) {
  let nextId = 0;
  let records: { id: number; schema: ProcessSchemaPropertyType[] }[];

  do {
    records = await frontSequelize.query<{
      id: number;
      schema: ProcessSchemaPropertyType[];
    }>(
      `SELECT id, schema
       FROM ${tableName}
       WHERE id > :nextId
         AND schema IS NOT NULL
         AND \"jsonSchema\" IS NULL
       ORDER BY id
       LIMIT :batchSize`,
      {
        replacements: { nextId, batchSize: BATCH_SIZE },
        type: QueryTypes.SELECT,
      }
    );

    if (records.length === 0) {
      break;
    }

    logger.info(
      `Processing ${records.length} items for table ${tableName}, ids ranging from ${records[0].id} to ${records[records.length - 1].id}`
    );

    if (execute) {
      for (const record of records) {
        const jsonSchema = renderSchemaPropertiesAsJSONSchema(record.schema);

        await frontSequelize.query(
          `UPDATE ${tableName}
           SET \"jsonSchema\" = :jsonSchema
           WHERE id = :id`,
          {
            replacements: {
              id: record.id,
              jsonSchema: JSON.stringify(jsonSchema),
            },
            type: QueryTypes.UPDATE,
          }
        );
      }
    }

    nextId = records[records.length - 1].id;
  } while (records.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting schema to JSONSchema conversion");

  // Process AgentProcessConfiguration records
  logger.info("Converting schemas in AgentProcessConfiguration records");
  await migrateTableSchemas({
    execute,
    logger,
    tableName: "agent_process_configurations",
  });

  // Process AgentProcessAction records
  logger.info("Converting schemas in AgentProcessAction records");
  await migrateTableSchemas({
    execute,
    logger,
    tableName: "agent_process_actions",
  });

  logger.info("Schema to JSONSchema conversion completed");
});
