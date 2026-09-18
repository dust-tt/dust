import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { SYSTEM_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/system";
import { reindexCodeDefinedSkills } from "@app/lib/skill_search/index_code_defined";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const skillIds = [...GLOBAL_SKILLS_ARRAY, ...SYSTEM_SKILLS_ARRAY].map(
    (skill) => skill.sId
  );
  logger.info({ execute, skillIds }, "Reindexing code-defined skills");

  if (!execute) {
    return;
  }

  const result = await reindexCodeDefinedSkills();
  if (result.isErr()) {
    throw result.error;
  }

  logger.info(result.value, "Code-defined skill search index updated");
});
