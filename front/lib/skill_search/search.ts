import type { Authenticator } from "@app/lib/auth";
import { searchResourceCandidates } from "@app/lib/search/resource_candidates";
import type { ResourceSearchSort } from "@app/lib/search/resource_query";
import { prepareResourceSearchQuery } from "@app/lib/search/resource_query";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
  SkillSearchResult,
} from "@app/types/api/skills";
import type { SearchMode } from "@app/types/search";
import { Ok } from "@app/types/shared/result";

export type { ResourceSearchSort as SkillSearchSort } from "@app/lib/search/resource_query";
export {
  MAX_RESOURCE_SEARCH_RESULTS as MAX_SKILL_SEARCH_RESULTS,
  RESOURCE_SEARCH_KEEP_ALIVE_SECONDS as SKILL_SEARCH_KEEP_ALIVE_SECONDS,
  ResourceSearchSortSchema as SkillSearchSortSchema,
} from "@app/lib/search/resource_query";

export interface SkillSearchCandidate {
  skill: SkillSearchResult | null;
  sort: ResourceSearchSort;
}

export async function prepareSkillSearchQuery(
  auth: Authenticator,
  searchTerm: string,
  permissionFiltering: SkillSearchPermissionFiltering = "strict",
  {
    mode = "autocomplete",
    filters = {},
  }: { mode?: SearchMode; filters?: SkillSearchFilters } = {}
) {
  return prepareResourceSearchQuery(auth, {
    searchTerm,
    resourceTypes: ["skill"],
    permissionFiltering,
    mode,
    filters,
  });
}

// Compatibility for callers exercising a skill-only candidate batch.
export async function searchSkillDocumentCandidates(
  auth: Authenticator,
  options: Omit<Parameters<typeof searchResourceCandidates>[1], "resourceTypes">
) {
  const result = await searchResourceCandidates(auth, {
    ...options,
    resourceTypes: ["skill"],
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok({
    ...result.value,
    candidates: result.value.candidates.map(({ entry, sort }) => ({
      sort,
      skill:
        entry?.type === "skill"
          ? entry.resource.toSearchJSON(auth, entry.score)
          : null,
    })),
  });
}
