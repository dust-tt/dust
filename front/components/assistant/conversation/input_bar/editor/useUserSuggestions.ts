import { useMemo } from "react";

import type { EditorSuggestionUser } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type { UserTypeWithWorkspace, WorkspaceType } from "@app/types";

/**
 * Converts UserTypeWithWorkspace to EditorSuggestionUser format.
 */
function makeEditorSuggestionUsers(
  users: UserTypeWithWorkspace[]
): EditorSuggestionUser[] {
  return users.map((user) => ({
    type: "user",
    id: user.sId,
    label: user.fullName,
    pictureUrl: user.image ?? "/static/humanavatar/anonymous.png",
    description: user.email,
  }));
}

/**
 * Hook to fetch and format user suggestions for the mention dropdown.
 * Returns empty arrays if the mentions_v2 feature flag is not enabled.
 *
 * @param owner - The workspace
 * @param enabled - Whether to fetch user suggestions (controlled by feature flag)
 */
const useUserSuggestions = (owner: WorkspaceType, enabled: boolean) => {
  // Fetch all workspace members for fallback suggestions.
  // We limit to a reasonable number for performance.
  const { members, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: "",
    pageIndex: 0,
    pageSize: 100,
    disabled: !enabled,
  });

  // `useMemo` will ensure that suggestions are only recalculated
  // when `members` changes.
  const allSuggestions = useMemo(() => {
    if (!enabled) {
      return { suggestions: [], fallbackSuggestions: [] };
    }

    const userSuggestions = makeEditorSuggestionUsers(members);

    // For now, primary suggestions are the same as fallback.
    // In the future, we could prioritize recently mentioned users or favorites.
    return {
      suggestions: userSuggestions,
      fallbackSuggestions: userSuggestions,
    };
  }, [members, enabled]);

  return { ...allSuggestions, isLoading: isLoading && enabled };
};

export default useUserSuggestions;
