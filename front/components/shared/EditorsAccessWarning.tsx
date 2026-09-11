import { SpaceLinks } from "@app/components/shared/SpaceLinks";
import type { EditorWithoutSpaceAccess } from "@app/components/shared/useEditorsWithoutSpaceAccess";
import { getSpaceName } from "@app/lib/spaces";
import type { EditorUser } from "@app/types/editors";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { AlertCircle, Button, ContentMessage } from "@dust-tt/sparkle";

interface EditorsAccessWarningProps {
  editorsWithoutSpaceAccess: EditorWithoutSpaceAccess[];
  entityName: "agent" | "skill";
  isEditorRemovalDisabled?: boolean;
  isSpaceRemovalDisabled?: boolean;
  onRemoveEditor: (editor: EditorUser) => void;
  onRemoveSpace: (space: SpaceType) => void;
  owner: LightWorkspaceType;
}

/**
 * One message per editor that cannot read a restricted space the agent or skill uses. Dropping the
 * space or the editor can be done from here; adding them to the space happens in the space itself,
 * which the message links to.
 */
export function EditorsAccessWarning({
  editorsWithoutSpaceAccess,
  entityName,
  isEditorRemovalDisabled,
  isSpaceRemovalDisabled,
  onRemoveEditor,
  onRemoveSpace,
  owner,
}: EditorsAccessWarningProps) {
  return (
    <div className="flex flex-col gap-2">
      {editorsWithoutSpaceAccess.map((editorWithoutAccess) => (
        <EditorAccessWarning
          key={editorWithoutAccess.editor.sId}
          editorWithoutAccess={editorWithoutAccess}
          entityName={entityName}
          isEditorRemovalDisabled={isEditorRemovalDisabled}
          isSpaceRemovalDisabled={isSpaceRemovalDisabled}
          onRemoveEditor={onRemoveEditor}
          onRemoveSpace={onRemoveSpace}
          owner={owner}
        />
      ))}
    </div>
  );
}

interface EditorAccessWarningProps {
  editorWithoutAccess: EditorWithoutSpaceAccess;
  entityName: "agent" | "skill";
  isEditorRemovalDisabled?: boolean;
  isSpaceRemovalDisabled?: boolean;
  onRemoveEditor: (editor: EditorUser) => void;
  onRemoveSpace: (space: SpaceType) => void;
  owner: LightWorkspaceType;
}

function EditorAccessWarning({
  editorWithoutAccess,
  entityName,
  isEditorRemovalDisabled,
  isSpaceRemovalDisabled,
  onRemoveEditor,
  onRemoveSpace,
  owner,
}: EditorAccessWarningProps) {
  const { editor, missingSpaces } = editorWithoutAccess;

  const isSingleSpace = missingSpaces.length === 1;

  return (
    <ContentMessage
      title="Invalid editors"
      variant="golden"
      icon={AlertCircle}
      size="lg"
    >
      <p>
        <strong>{editor.fullName}</strong> is an editor of this {entityName} but
        is not a member of <SpaceLinks owner={owner} spaces={missingSpaces} />,
        so they cannot view or use it. Add them{" "}
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
            disabled={isSpaceRemovalDisabled}
            onClick={() => {
              onRemoveSpace(space);
            }}
          />
        ))}
        <Button
          size="xs"
          variant="outline"
          label="Remove editor"
          disabled={isEditorRemovalDisabled}
          onClick={() => {
            onRemoveEditor(editor);
          }}
        />
      </div>
    </ContentMessage>
  );
}
