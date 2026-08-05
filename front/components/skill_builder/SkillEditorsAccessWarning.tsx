import { SpaceLinks } from "@app/components/shared/SpaceLinks";
import type { EditorWithoutSpaceAccess } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import type { LightWorkspaceType } from "@app/types/user";
import { AlertCircle, ContentMessage } from "@dust-tt/sparkle";

interface SkillEditorsAccessWarningProps {
  editorsWithoutSpaceAccess: EditorWithoutSpaceAccess[];
  owner: LightWorkspaceType;
}

export function SkillEditorsAccessWarning({
  editorsWithoutSpaceAccess,
  owner,
}: SkillEditorsAccessWarningProps) {
  if (editorsWithoutSpaceAccess.length === 0) {
    return null;
  }

  const isSingle = editorsWithoutSpaceAccess.length === 1;

  return (
    <ContentMessage
      variant="warning"
      icon={AlertCircle}
      size="lg"
      title={
        isSingle
          ? "An editor doesn't have access to this skill"
          : "Some editors don't have access to this skill"
      }
    >
      {isSingle ? (
        <p>
          <strong>{editorsWithoutSpaceAccess[0].editor.fullName}</strong> is not
          a member of{" "}
          <SpaceLinks
            owner={owner}
            spaces={editorsWithoutSpaceAccess[0].spaces}
          />
          , so they cannot view or use this skill. Add them to the space, or
          remove them from the editors.
        </p>
      ) : (
        <>
          <p className="mb-1">
            These editors are not members of the restricted spaces this skill
            uses, so they cannot view or use it. Add them to the spaces, or
            remove them from the editors.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {editorsWithoutSpaceAccess.map(({ editor, spaces }) => (
              <li key={editor.sId}>
                <strong>{editor.fullName}</strong> is missing{" "}
                <SpaceLinks owner={owner} spaces={spaces} />
              </li>
            ))}
          </ul>
        </>
      )}
    </ContentMessage>
  );
}
