import { SpaceLinks } from "@app/components/shared/SpaceLinks";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { EditorWithoutSpaceAccess } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import { useRemoveSkillSpace } from "@app/components/skill_builder/useRemoveSkillSpace";
import { getSpaceName } from "@app/lib/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { AlertCircle, Button, ContentMessage } from "@dust-tt/sparkle";
import { useController } from "react-hook-form";

interface SkillEditorsAccessWarningProps {
  editorsWithoutSpaceAccess: EditorWithoutSpaceAccess[];
  owner: LightWorkspaceType;
}

/**
 * One message per editor that cannot read a restricted space the skill uses. Dropping the space or
 * the editor can be done from here; adding them to the space happens in the space itself, which the
 * message links to.
 */
export function SkillEditorsAccessWarning({
  editorsWithoutSpaceAccess,
  owner,
}: SkillEditorsAccessWarningProps) {
  return (
    <div className="flex flex-col gap-2">
      {editorsWithoutSpaceAccess.map((editorWithoutAccess) => (
        <EditorAccessWarning
          key={editorWithoutAccess.editor.sId}
          editorWithoutAccess={editorWithoutAccess}
          owner={owner}
        />
      ))}
    </div>
  );
}

interface EditorAccessWarningProps {
  editorWithoutAccess: EditorWithoutSpaceAccess;
  owner: LightWorkspaceType;
}

function EditorAccessWarning({
  editorWithoutAccess,
  owner,
}: EditorAccessWarningProps) {
  const { editor, missingSpaces } = editorWithoutAccess;

  const { field: editorsField } = useController<
    SkillBuilderFormData,
    "editors"
  >({
    name: "editors",
  });
  const { removeSpace, isRemovalDisabled } = useRemoveSkillSpace();

  const handleRemoveEditor = () => {
    editorsField.onChange(
      (editorsField.value ?? []).filter(
        (currentEditor) => currentEditor.sId !== editor.sId
      )
    );
  };

  const isSingleSpace = missingSpaces.length === 1;

  return (
    <ContentMessage
      title="Invalid editors"
      variant="golden"
      icon={AlertCircle}
      size="lg"
    >
      <p>
        <strong>{editor.fullName}</strong> is an editor of this skill but is not
        a member of <SpaceLinks owner={owner} spaces={missingSpaces} />, so they
        cannot view or use it. Add them{" "}
        {isSingleSpace ? "to that space" : "to those spaces"}, remove{" "}
        {isSingleSpace ? "that space" : "those spaces"} restriction or remove
        them from editors:
      </p>
      <div className="mt-2 flex flex-row flex-wrap items-center gap-2">
        {missingSpaces.map((space) => (
          <Button
            key={space.sId}
            size="xs"
            variant="outline"
            label={`Remove ${getSpaceName(space)}`}
            disabled={isRemovalDisabled}
            onClick={() => {
              void removeSpace(space);
            }}
          />
        ))}
        <Button
          size="xs"
          variant="outline"
          label="Remove editor"
          disabled={editorsField.disabled}
          onClick={handleRemoveEditor}
        />
      </div>
    </ContentMessage>
  );
}
