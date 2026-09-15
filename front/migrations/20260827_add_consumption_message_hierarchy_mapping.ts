import { getClient } from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";

const INDEX_NAME = "front.agent_message_consumption_analytics_1";

const MESSAGE_HIERARCHY_MAPPING: Record<string, estypes.MappingProperty> = {
  parent_agent_message_id: { type: "keyword" },
  root_agent_message_id: { type: "keyword" },
};

makeScript({}, async ({ execute }, logger) => {
  const client = await getClient();
  const currentMapping = await client.indices.getMapping({ index: INDEX_NAME });
  const properties = currentMapping[INDEX_NAME]?.mappings?.properties ?? {};
  const missingMapping = Object.fromEntries(
    Object.entries(MESSAGE_HIERARCHY_MAPPING).filter(
      ([field]) => !(field in properties)
    )
  );

  if (Object.keys(missingMapping).length === 0) {
    logger.info(
      "Consumption message hierarchy mapping already exists, skipping."
    );
    return;
  }
  if (!execute) {
    logger.info(
      { mapping: missingMapping },
      "Dry run - would add consumption message hierarchy mapping"
    );
    return;
  }

  const response = await client.indices.putMapping({
    index: INDEX_NAME,
    body: { properties: missingMapping },
  });
  if (!response.acknowledged) {
    throw new Error(
      `Failed to update consumption mapping: ${JSON.stringify(response)}`
    );
  }

  logger.info("Successfully added consumption message hierarchy mapping");
});
