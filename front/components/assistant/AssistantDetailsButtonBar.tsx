import {
  isBuilder,
  type LightAgentConfigurationType,
  type WorkspaceType,
} from "@dust-tt/types";
import { useUser } from "@app/lib/swr/user";
import { AssistantDetailsDropdownMenu } from "@app/components/assistant/AssistantDetailsDropdownMenu";
import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  PencilSquareIcon,
  StarIcon,
  StarStrokeIcon,
} from "@dust-tt/sparkle";
import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import Link from "next/link";

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

  const showEditButton =
    // never allow editing of global assistants
    agentConfiguration.scope !== "global" &&
    // builders can all edit, non-builders can only edit personal/shared assistants
    (isBuilder(owner) || !(agentConfiguration.scope === "workspace"));

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

      <Link
        href={`/w/${owner.sId}/assistant/new?assistant=${agentConfiguration.sId}`}
      >
        <Button
          icon={ChatBubbleBottomCenterTextIcon}
          label="Chat with this assistant"
          labelVisible={false}
          size="sm"
          variant="tertiary"
          hasMagnifying={false}
        />
      </Link>

      {showEditButton && (
        <Link
          href={`/w/${owner.sId}/builder/assistants/${
            agentConfiguration.sId
          }?flow=${
            agentConfiguration.scope
              ? "workspace_assistants"
              : "personal_assistants"
          }`}
        >
          <Button
            label="Edit this assistant"
            labelVisible={false}
            size="sm"
            variant="tertiary"
            hasMagnifying={false}
            icon={PencilSquareIcon}
          />
        </Link>
      )}

      {agentConfiguration.scope !== "global" && (
        <AssistantDetailsDropdownMenu
          agentConfiguration={agentConfiguration}
          owner={owner}
          variant="button"
          canDelete
        />
      )}
    </div>
  );
}
