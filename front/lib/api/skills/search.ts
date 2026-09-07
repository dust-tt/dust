import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import {
  MAX_SKILL_SEARCH_RESULTS,
  searchSkillDocuments,
} from "@app/lib/skill_search/search";
import type { SkillSearchResult } from "@app/types/api/skills";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function searchSkillsForCommandMenu(
  auth: Authenticator,
  { searchTerm }: { searchTerm: string }
): Promise<Result<SkillSearchResult[], ElasticsearchError>> {
  const customSkillsResult = await searchSkillDocuments(auth, {
    searchTerm,
    limit: MAX_SKILL_SEARCH_RESULTS,
  });
  if (customSkillsResult.isErr()) {
    return new Err(customSkillsResult.error);
  }

  // Keep every allowed code-defined skill in the response. Their aliases are
  // owned by the client-side command-menu ranking and may match terms that are
  // absent from their canonical name and description.
  const globalSkills = await GlobalSkillsRegistry.findAll(auth);
  const systemSkills = await SystemSkillsRegistry.findAll(auth);

  const customSkillSuggestions = customSkillsResult.value.map(
    (skill): SkillSearchResult => ({
      editedBy: skill.edited_by,
      icon: skill.icon,
      name: skill.name,
      requestedSpaceIds: skill.requested_space_ids,
      sId: skill.skill_id,
      userFacingDescription: skill.user_facing_description ?? "",
    })
  );
  const codeDefinedSkillSuggestions = [...globalSkills, ...systemSkills].map(
    (skill): SkillSearchResult => ({
      editedBy: null,
      icon: skill.icon,
      name: skill.name,
      requestedSpaceIds: [],
      sId: skill.sId,
      userFacingDescription: skill.userFacingDescription,
    })
  );
  return new Ok([...customSkillSuggestions, ...codeDefinedSkillSuggestions]);
}
