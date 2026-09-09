import { searchResources } from "@app/lib/api/resource_search";
import type { Authenticator } from "@app/lib/auth";
import type { SkillSearchFilters } from "@app/types/api/skills";
import type { ResourceSearchOptions } from "@app/types/search";
import { Ok } from "@app/types/shared/result";
import assert from "assert";

// Preserve the slash endpoint's existing wire shape while sharing the complete search path.
export async function searchSkillsForCommandMenu(
  auth: Authenticator,
  options: Omit<ResourceSearchOptions, "resourceTypes" | "filters"> & {
    filters?: SkillSearchFilters;
  }
) {
  const result = await searchResources(auth, {
    ...options,
    resourceTypes: ["skill"],
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok({
    skills: result.value.results.map((entry) => {
      assert(entry.type === "skill");
      return entry.resource.toSearchJSON(auth, entry.score);
    }),
    nextCursor: result.value.nextCursor,
  });
}
