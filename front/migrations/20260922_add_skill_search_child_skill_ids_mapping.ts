import { getClient, SKILL_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";

const CHILD_SKILL_IDS_MAPPING: Record<string, estypes.MappingProperty> = {
  child_skill_ids: { type: "keyword" },
};

// Run before deploying the new indexer, then run scripts/backfill_skill_search.ts
// with --execute after deployment to populate existing documents.
makeScript({}, async ({ execute }, logger) => {
  if (!execute) {
    logger.info(
      { index: SKILL_SEARCH_ALIAS_NAME, mapping: CHILD_SKILL_IDS_MAPPING },
      "Dry run - would add 'child_skill_ids' mapping to the skills index"
    );
    return;
  }

  const client = await getClient();
  // Adding the same mapping again is safe, so this migration can be rerun.
  const response = await client.indices.putMapping({
    index: SKILL_SEARCH_ALIAS_NAME,
    properties: CHILD_SKILL_IDS_MAPPING,
  });

  if (!response.acknowledged) {
    throw new Error(`Failed to update mapping: ${JSON.stringify(response)}`);
  }

  logger.info(
    "Successfully added 'child_skill_ids' mapping to the skills index"
  );
});
