import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

export async function indexSkillDocument(
  document: SkillSearchDocument
): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    const { active_users_count, ...fields } = document;
    await client.update({
      index: SKILL_SEARCH_ALIAS_NAME,
      id: `${document.workspace_id}_${document.skill_id}`,
      doc: fields,
      upsert: { ...fields, active_users_count },
      retry_on_conflict: 3,
    });
  });
}
