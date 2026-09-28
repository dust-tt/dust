import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  SkillSuggestionKind,
  SkillSuggestionType,
} from "@app/types/suggestions/skill_suggestion";
import { isAvailabilitySkillSuggestion } from "@app/types/suggestions/skill_suggestion";

type SkillSuggestionRequiredVerb = "write" | "admin";
type SkillSuggestionCapability = "create" | "publish" | "make_discoverable";

/**
 * @cc [owner:avervaet,label:security] skill-suggestion-kind-required-verb
 * Every `SkillSuggestionKind` MUST have an entry here with the verbs required to
 * do the corresponding action.
 */
/**
 * @cc [owner:fabiencelier,label:security] skill-suggestion-verb-matches-write-path
 * Each entry MUST be the verbs the `SkillResource` write path that applies the kind enforces:
 * `updateSkill`, `addEditors`/`removeEditors`, `updateAvailabilities` and `delete`. Changing what a
 * write path checks MUST update this map in the same change, and conversely.
 */
const SKILL_SUGGESTION_KIND_REQUIRED_VERBS: Record<
  SkillSuggestionKind,
  readonly SkillSuggestionRequiredVerb[]
> = {
  edit: ["write"],
  user_facing_description: ["write"],
  create: ["write"],
  name: ["write"],
  editors: ["admin"],
  delete: ["admin"],
  availability: ["admin"],
};

function getRequiredCapabilities(
  skill: SkillResource,
  suggestion: Pick<SkillSuggestionType, "kind" | "suggestion">
): SkillSuggestionCapability[] {
  switch (suggestion.kind) {
    case "create":
      return ["create"];
    case "availability":
      // Moving a skill to or off `users_and_agents` also requires `make_discoverable` (see
      // `updateAvailabilities`).
      return isAvailabilitySkillSuggestion(suggestion) &&
        (suggestion.suggestion.availability === "users_and_agents" ||
          skill.availability === "users_and_agents")
        ? ["publish", "make_discoverable"]
        : ["publish"];
    case "edit":
    case "editors":
    case "user_facing_description":
    case "name":
    case "delete":
      return [];
    default:
      return assertNever(suggestion.kind);
  }
}

export function isAuthorizedForSkillSuggestion(
  auth: Authenticator,
  skill: SkillResource,
  suggestion: Pick<SkillSuggestionType, "kind" | "suggestion">
): boolean {
  const holdsCapabilities = getRequiredCapabilities(skill, suggestion).every(
    (capability) => auth.hasWorkspacePermission(capability, "skill")
  );
  if (!holdsCapabilities) {
    return false;
  }

  return SKILL_SUGGESTION_KIND_REQUIRED_VERBS[suggestion.kind].every((verb) =>
    auth.can(verb, skill)
  );
}

export function skillSuggestionsRequireAdmin(
  suggestions: { kind: SkillSuggestionKind }[]
): boolean {
  return suggestions.some((s) =>
    SKILL_SUGGESTION_KIND_REQUIRED_VERBS[s.kind].includes("admin")
  );
}

/**
 * @cc [owner:fabiencelier,label:security] skill-suggestions-require-every-verb
 * A set of suggestions MUST only be authorized when the caller meets the requirements of every one
 * of them: verbs are independent, holding `admin` does not imply `write`.
 */
export function isAuthorizedToApplySkillSuggestions(
  auth: Authenticator,
  skill: SkillResource,
  suggestions: Pick<SkillSuggestionType, "kind" | "suggestion">[]
): boolean {
  return suggestions.every((s) =>
    isAuthorizedForSkillSuggestion(auth, skill, s)
  );
}
