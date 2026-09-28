import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionKind } from "@app/types/suggestions/skill_suggestion";

// `publish` is a workspace-wide capability: it is held on the `skill` type, never on an instance,
// so `auth.can("publish", skill)` is always false and it is checked with `hasWorkspacePermission`.
type SkillSuggestionRequiredVerb = "write" | "admin" | "publish";

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
  // `make_discoverable` is not listed: it depends on the values (either side being `users_and_agents`)
  availability: ["admin", "publish"],
};

function holdsVerb(
  auth: Authenticator,
  skill: SkillResource,
  verb: SkillSuggestionRequiredVerb
): boolean {
  return verb === "publish"
    ? auth.hasWorkspacePermission("publish", "skill")
    : auth.can(verb, skill);
}

export function isAuthorizedForSkillSuggestionKind(
  auth: Authenticator,
  skill: SkillResource,
  kind: SkillSuggestionKind
): boolean {
  return SKILL_SUGGESTION_KIND_REQUIRED_VERBS[kind].every((verb) =>
    holdsVerb(auth, skill, verb)
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
  suggestions: { kind: SkillSuggestionKind }[]
): boolean {
  return suggestions.every((s) =>
    isAuthorizedForSkillSuggestionKind(auth, skill, s.kind)
  );
}
