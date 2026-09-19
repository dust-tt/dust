import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useRemoveAgentSpace } from "@app/components/agent_builder/hooks/useRemoveAgentSpace";
import { EditorsAccessWarning } from "@app/components/shared/EditorsAccessWarning";
import type { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import type { EditorWithoutSpaceAccess } from "@app/components/shared/useEditorsWithoutSpaceAccess";
import type { EditorUser } from "@app/types/editors";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { useController } from "react-hook-form";

interface AgentEditorsAccessWarningProps {
  editorsWithoutSpaceAccess: EditorWithoutSpaceAccess[];
  owner: LightWorkspaceType;
  spaceIdToActions: ReturnType<typeof getSpaceIdToActionsMap>;
}

export function AgentEditorsAccessWarning({
  editorsWithoutSpaceAccess,
  owner,
  spaceIdToActions,
}: AgentEditorsAccessWarningProps) {
  const { field: editorsField } = useController<
    AgentBuilderFormData,
    "agentSettings.editors"
  >({
    name: "agentSettings.editors",
  });
  const { removeSpace } = useRemoveAgentSpace({ spaceIdToActions });

  const handleRemoveEditor = (editor: EditorUser) => {
    editorsField.onChange(
      (editorsField.value ?? []).filter(
        (currentEditor) => currentEditor.sId !== editor.sId
      )
    );
  };

  const handleRemoveSpace = (space: SpaceType) => {
    void removeSpace(space);
  };

  return (
    <EditorsAccessWarning
      editorsWithoutSpaceAccess={editorsWithoutSpaceAccess}
      entityName="agent"
      isEditorRemovalDisabled={editorsField.disabled}
      onRemoveEditor={handleRemoveEditor}
      onRemoveSpace={handleRemoveSpace}
      owner={owner}
    />
  );
}
