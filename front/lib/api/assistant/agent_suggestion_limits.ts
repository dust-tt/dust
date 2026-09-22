import {
  MAX_PENDING_INSTRUCTIONS_SUGGESTIONS,
  MAX_PENDING_KNOWLEDGE_SUGGESTIONS,
  MAX_PENDING_SKILLS_SUGGESTIONS,
  MAX_PENDING_SUB_AGENT_SUGGESTIONS,
  MAX_PENDING_TOOLS_SUGGESTIONS,
} from "@app/lib/api/actions/servers/agent_sidekick_context/constants";

export type LimitedSuggestionKind =
  | "instructions"
  | "tools"
  | "sub_agent"
  | "skills"
  | "knowledge";

function getMaxPendingSuggestions(kind: LimitedSuggestionKind): number {
  switch (kind) {
    case "instructions":
      return MAX_PENDING_INSTRUCTIONS_SUGGESTIONS;
    case "tools":
      return MAX_PENDING_TOOLS_SUGGESTIONS;
    case "sub_agent":
      return MAX_PENDING_SUB_AGENT_SUGGESTIONS;
    case "skills":
      return MAX_PENDING_SKILLS_SUGGESTIONS;
    case "knowledge":
      return MAX_PENDING_KNOWLEDGE_SUGGESTIONS;
  }
}

/**
 * @cc [owner:avervaet,label:mcp] pending-suggestion-limit-enforced-by-caller
 * There is no enforcement of the per-kind pending suggestion cap at the resource layer: every
 * surface that creates suggestions of a `LimitedSuggestionKind` MUST call this with the current
 * pending count for that agent and kind before creating them, or pending suggestions of that
 * kind can accumulate without bound. `resolutionHint` is caller-supplied because the remediation
 * differs per surface (e.g. sidekick points the model at `update_suggestions_state`, which does
 * not exist in every calling context).
 */
export function canAddPendingSuggestions({
  kind,
  newPendingCount,
  currentPendingCount,
  resolutionHint,
}: {
  kind: LimitedSuggestionKind;
  newPendingCount: number;
  currentPendingCount: number;
  resolutionHint: string;
}): { allowed: true } | { allowed: false; errorMessage: string } {
  const maxAllowed = getMaxPendingSuggestions(kind);

  const totalAfterAddition = currentPendingCount + newPendingCount;

  if (totalAfterAddition > maxAllowed) {
    const availableSlots = Math.max(0, maxAllowed - currentPendingCount);

    return {
      allowed: false,
      errorMessage:
        `Cannot add ${newPendingCount} new ${kind} suggestion(s): ` +
        `this would exceed the limit of ${maxAllowed} pending ${kind} suggestions. ` +
        `Currently ${currentPendingCount} pending, only ${availableSlots} slot(s) available. ` +
        resolutionHint,
    };
  }

  return { allowed: true };
}
