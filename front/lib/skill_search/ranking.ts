import type {
  SkillSearchSort,
  SkillSearchSortOrder,
} from "@app/types/api/skills";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

/**
 * @cc [owner:aubin-tchoi,label:product] relevance-tie-breaking
 * When sorting by relevance, usage MUST break relevance ties, then skill ID.
 */
export function buildSkillDefaultSort({
  sortBy = "relevance",
  sortOrder = sortBy === "name" ? "asc" : "desc",
}: {
  sortBy?: SkillSearchSort;
  sortOrder?: SkillSearchSortOrder;
} = {}): estypes.Sort {
  switch (sortBy) {
    case "relevance":
      return [
        { _score: { order: sortOrder } },
        { active_users_count: { order: "desc", missing: "_last" } },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    case "usage":
      return [
        { active_users_count: { order: sortOrder, missing: "_last" } },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    case "name":
      return [
        { "name.keyword": { order: sortOrder, missing: "_last" } },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    case "updatedAt":
      return [
        // Format dates so missing-date cursors do not contain unsafe JSON integers.
        {
          updated_at: {
            order: sortOrder,
            missing: "_last",
            format: "epoch_millis",
          },
        },
        // Skill ID is the tie-breaker.
        { skill_id: { order: "asc" } },
      ];
    default:
      assertNever(sortBy);
  }
}
