import { useMemo } from "react";

import type { EditorSuggestionUser } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type { UserTypeWithWorkspace, WorkspaceType } from "@app/types";

function makeEditorSuggestionUsers(
  members: UserTypeWithWorkspace[]
): EditorSuggestionUser[] {
  return members.map((m) => ({
    type: "user",
    id: m.sId,
    label: m.fullName,
    pictureUrl: m.image ?? "",
    description: m.email,
  }));
}

const useMemberSuggestions = (
  owner: WorkspaceType,
  searchTerm: string,
  disabled: boolean
) => {
  const { members, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: 0,
    pageSize: 50,
    disabled,
  });

  const allSuggestions = useMemo(() => {
    const suggestions = makeEditorSuggestionUsers(members);

    // For members, fallback suggestions are the same as the current suggestions coming
    // from the debounced search endpoint.
    const fallbackSuggestions = suggestions;

    return { suggestions, fallbackSuggestions };
  }, [members]);

  return { ...allSuggestions, isLoading };
};

export default useMemberSuggestions;
