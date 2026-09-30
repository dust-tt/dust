import type { MemberDisplayInfo } from "@app/lib/swr/assistants";
import type { LightUserType } from "@app/types/user";

interface SuggestedEditorsChange {
  addUserIds: string[];
  removeUserIds: string[];
}

interface ResolveDisplayedEditorsInput {
  editors: LightUserType[];
  suggestedEditors: SuggestedEditorsChange | null;
  membersById: Record<string, MemberDisplayInfo>;
}

export function resolveDisplayedEditors({
  editors,
  suggestedEditors,
  membersById,
}: ResolveDisplayedEditorsInput): LightUserType[] {
  if (!suggestedEditors) {
    return editors;
  }

  const removedUserIds = new Set(suggestedEditors.removeUserIds);
  const editorIds = new Set(editors.map((editor) => editor.sId));

  const addedEditors = suggestedEditors.addUserIds
    .filter((userId) => !editorIds.has(userId))
    .map((userId) => {
      const member = membersById[userId];
      return {
        sId: userId,
        firstName: member?.firstName ?? userId,
        lastName: member?.lastName ?? null,
        fullName: member?.fullName ?? userId,
        image: member?.image ?? null,
        email: member?.email ?? "",
      };
    });

  return [
    ...editors.filter((editor) => !removedUserIds.has(editor.sId)),
    ...addedEditors,
  ];
}
