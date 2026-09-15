import { useSpacesAccessCheck } from "@app/lib/swr/spaces";
import type { EditorUser } from "@app/types/editors";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

/** An editor of the agent or skill, with the restricted spaces they cannot read. */
export interface EditorWithoutSpaceAccess {
  editor: EditorUser;
  missingSpaces: SpaceType[];
}

/**
 * @cc [owner:ykmsd,label:react] readable-spaces-only
 * `restrictedSpaces` MUST only contain spaces the current user can read: the underlying
 * `spaces/access-check` endpoint rejects the whole request when any requested space is not
 * readable by the caller, which would blank the warning for every editor.
 */
export function useEditorsWithoutSpaceAccess({
  owner,
  restrictedSpaces,
  editors,
}: {
  owner: LightWorkspaceType;
  restrictedSpaces: SpaceType[];
  editors: EditorUser[] | undefined;
}): EditorWithoutSpaceAccess[] {
  const restrictedSpaceIds = useMemo(() => {
    return restrictedSpaces.map((space) => space.sId);
  }, [restrictedSpaces]);

  const editorIds = useMemo(() => {
    return (editors ?? []).map((editor) => editor.sId);
  }, [editors]);

  const { spacesAccess } = useSpacesAccessCheck({
    workspaceId: owner.sId,
    spaceIds: restrictedSpaceIds,
    userIds: editorIds,
  });

  return useMemo(() => {
    const spaceById = new Map(
      restrictedSpaces.map((space) => [space.sId, space])
    );
    const missingSpacesByEditorId = new Map<string, SpaceType[]>();

    for (const { spaceId, userIdsWithoutAccess } of spacesAccess) {
      const space = spaceById.get(spaceId);
      if (!space) {
        continue;
      }

      for (const userId of userIdsWithoutAccess) {
        const existing = missingSpacesByEditorId.get(userId);
        if (existing) {
          existing.push(space);
        } else {
          missingSpacesByEditorId.set(userId, [space]);
        }
      }
    }

    return (editors ?? []).flatMap((editor) => {
      const missingSpaces = missingSpacesByEditorId.get(editor.sId);
      return missingSpaces ? [{ editor, missingSpaces }] : [];
    });
  }, [editors, restrictedSpaces, spacesAccess]);
}
