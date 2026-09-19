import { reindexCodeDefinedSkills } from "@app/lib/skill_search/index_code_defined";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  if (!execute) {
    return;
  }

  const result = await reindexCodeDefinedSkills();
  if (result.isErr()) {
    throw result.error;
  }

  logger.info(result.value, "Code-defined skill search index updated");
});
