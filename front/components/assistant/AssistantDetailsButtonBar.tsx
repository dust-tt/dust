import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useUser } from "@app/lib/swr/user";
import { AssistantDetailsDropdownMenu } from "@app/components/assistant/AssistantDetailsDropdownMenu";
import { Button, StarIcon, StarStrokeIcon } from "@dust-tt/sparkle";
import { useUpdateUserFavorite } from "@app/lib/swr/assistants";

interface AssistantDetailsButtonBarProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  canDelete?: boolean;
  isMoreInfoVisible?: boolean;
  showAddRemoveToFavorite?: boolean;
}

export function AssistantDetailsButtonBar({
  agentConfiguration,
  owner,
}: AssistantDetailsButtonBarProps) {
  const { user } = useUser();

  const updateUserFavorite = useUpdateUserFavorite({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });

  if (
    !agentConfiguration ||
    agentConfiguration.status === "archived" ||
    !user
  ) {
    return <></>;
  }

  return (
    <div className="flex flex-row items-center gap-2 px-1.5">
      <Button
        icon={agentConfiguration.userFavorite ? StarIcon : StarStrokeIcon}
        label={`${agentConfiguration.userFavorite ? "Remove from" : "Add to"} favorites`}
        labelVisible={false}
        size="sm"
        variant="tertiary"
        hasMagnifying={false}
        onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
      />

      <div className="h-6 w-0 border-l border-structure-200"></div>

      <AssistantDetailsDropdownMenu
        agentConfiguration={agentConfiguration}
        owner={owner}
        variant="button"
        canDelete
      />
    </div>
  );
}
