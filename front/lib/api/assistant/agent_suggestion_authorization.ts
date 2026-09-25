import type { Authenticator } from "@app/lib/auth";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";

type AgentSuggestionVerb = "write" | "admin";
type AgentSuggestionCapability = "create" | "publish";

/**
 * @cc [owner:fabiencelier,label:security] agent-suggestion-kind-accepted-verbs
 * Every `AgentSuggestionKind` MUST have an entry here, listing the agent verbs any one of which
 * allows applying a suggestion of that kind.
 */
/**
 * @cc [owner:fabiencelier,label:security] agent-suggestion-verbs-match-write-path
 * Each entry MUST be the verbs the `AgentResource` write path that applies the kind accepts.
 * See `AgentResource` methods `updateConfiguration`, `updateScopeInPlace` and `archive`.
 */
const AGENT_SUGGESTION_KIND_ACCEPTED_VERBS: Record<
  AgentSuggestionKind,
  readonly AgentSuggestionVerb[]
> = {
  instructions: ["write"],
  tools: ["write"],
  sub_agent: ["write"],
  skills: ["write"],
  knowledge: ["write"],
  name: ["write"],
  description: ["write"],
  // Turning the pending placeholder into an agent is a definition edit.
  create: ["write"],
  model: ["write", "admin"],
  scope: ["write", "admin"],
  delete: ["admin"],
};

const AGENT_SUGGESTION_KIND_WORKSPACE_CAPABILITY: Partial<
  Record<AgentSuggestionKind, AgentSuggestionCapability>
> = {
  create: "create",
  scope: "publish",
};

export function isAuthorizedForAgentSuggestionKind(
  auth: Authenticator,
  agent: AgentResource,
  kind: AgentSuggestionKind
): boolean {
  const capability = AGENT_SUGGESTION_KIND_WORKSPACE_CAPABILITY[kind];
  if (capability && !auth.hasWorkspacePermission(capability, "agent")) {
    return false;
  }

  return AGENT_SUGGESTION_KIND_ACCEPTED_VERBS[kind].some((verb) =>
    auth.can(verb, agent)
  );
}

/**
 * @cc [owner:fabiencelier,label:security] agent-suggestions-require-every-kind
 * A set of suggestions MUST only be authorized when the caller is authorized for the kind of every
 * one of them: verbs are independent, holding `admin` does not imply `write`.
 */
export function isAuthorizedToApplyAgentSuggestions(
  auth: Authenticator,
  agent: AgentResource,
  suggestions: { kind: AgentSuggestionKind }[]
): boolean {
  return suggestions.every((s) =>
    isAuthorizedForAgentSuggestionKind(auth, agent, s.kind)
  );
}
