import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { RichUserMentionInConversation } from "@app/types/assistant/mentions";

/**
 * Maximum number of suggestions to display in the autocomplete dropdown.
 */
export const SUGGESTION_DISPLAY_LIMIT = 20;

/**
 * Priority order for specific agent suggestions.
 * Lower numbers appear first in the list when within the display limit.
 */
export const SUGGESTION_PRIORITY: Record<string, number> = {
  [GLOBAL_AGENTS_SID.DUST]: 1,
  [GLOBAL_AGENTS_SID.DEEP_DIVE]: 2,
};

export function sortEditorSuggestionUsers(
  suggestions: RichUserMentionInConversation[]
) {
  return suggestions.sort((a, b) => {
    // If within the conversation participants, we move it to the top.
    if (a.isParticipant && !b.isParticipant) {
      return -1;
    }
    if (b.isParticipant && !a.isParticipant) {
      return 1;
    }
    // If both are participants, we sort by last activity.
    if (a.isParticipant && b.isParticipant) {
      return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
    }
    // If project members, we move them up.
    if (a.isProjectMember && !b.isProjectMember) {
      return -1;
    }
    if (b.isProjectMember && !a.isProjectMember) {
      return 1;
    }
    // If both are project members, we sort by last activity.
    if (a.isProjectMember && b.isProjectMember) {
      return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
    }
    return 0;
  });
}
