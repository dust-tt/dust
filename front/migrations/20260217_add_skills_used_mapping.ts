import { getClient } from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";

const INDEX_NAME = "front.agent_message_analytics_2";

const SKILLS_USED_MAPPING: Record<string, estypes.MappingProperty> = {
  skills_used: {
    type: "nested",
    properties: {
      skill_id: { type: "keyword" },
      skill_name: { type: "keyword" },
      skill_type: { type: "keyword" },
      source: { type: "keyword" },
    },
  },
};

makeScript({}, async ({ execute }, logger) => {
  const client = await getClient();

  const currentMapping = await client.indices.getMapping({
    index: INDEX_NAME,
  });

  const properties = currentMapping[INDEX_NAME]?.mappings?.properties ?? {};

  if ("skills_used" in properties) {
    logger.info("Field 'skills_used' already exists in mapping, skipping.");
    return;
  }

  if (!execute) {
    logger.info(
      { mapping: SKILLS_USED_MAPPING },
      "Dry run - would add 'skills_used' mapping to index"
    );
    return;
  }

  const response = await client.indices.putMapping({
    index: INDEX_NAME,
    body: { properties: SKILLS_USED_MAPPING },
  });

  if (!response.acknowledged) {
    throw new Error(`Failed to update mapping: ${JSON.stringify(response)}`);
  }

  logger.info("Successfully added 'skills_used' mapping to index");
});
