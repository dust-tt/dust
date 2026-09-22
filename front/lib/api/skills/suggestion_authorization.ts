import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionKind } from "@app/types/suggestions/skill_suggestion";

type SkillSuggestionRequiredVerb = "write" | "admin";

/**
 * @cc [owner:avervaet,label:security] skill-suggestion-kind-required-verb
 * Every `SkillSuggestionKind` MUST have an entry here: lifecycle operations (adding/removing
 * editors, archiving) require `admin`, operations that only edit content require `write`.
 */
const SKILL_SUGGESTION_KIND_REQUIRED_VERB: Record<
  SkillSuggestionKind,
  SkillSuggestionRequiredVerb
> = {
  edit: "write",
  user_facing_description: "write",
  create: "write",
  name: "write",
  editors: "admin",
  delete: "admin",
  availability: "admin",
  reinforcement: "admin",
};

function isAuthorizedForVerb(
  auth: Authenticator,
  skill: SkillResource,
  verb: SkillSuggestionRequiredVerb
): boolean {
  return verb === "admin" ? skill.canAdministrate(auth) : skill.canWrite(auth);
}

export function isAuthorizedForSkillSuggestionKind(
  auth: Authenticator,
  skill: SkillResource,
  kind: SkillSuggestionKind
): boolean {
  return isAuthorizedForVerb(
    auth,
    skill,
    SKILL_SUGGESTION_KIND_REQUIRED_VERB[kind]
  );
}

export function skillSuggestionsRequireAdmin(
  suggestions: { kind: SkillSuggestionKind }[]
): boolean {
  return suggestions.some(
    (s) => SKILL_SUGGESTION_KIND_REQUIRED_VERB[s.kind] === "admin"
  );
}

// A batch is authorized only if the caller holds the strictest verb any suggestion in it requires.
export function isAuthorizedToApplySkillSuggestions(
  auth: Authenticator,
  skill: SkillResource,
  suggestions: { kind: SkillSuggestionKind }[]
): boolean {
  return isAuthorizedForVerb(
    auth,
    skill,
    skillSuggestionsRequireAdmin(suggestions) ? "admin" : "write"
  );
}
