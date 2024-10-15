import {
  isBuilder,
  type LightAgentConfigurationType,
  type WorkspaceType,
} from "@dust-tt/types";
import { useUser } from "@app/lib/swr/user";
import { AssistantDropdownMenu } from "@app/components/assistant/AssistantDetailsDropdownMenu";
import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  PencilSquareIcon,
  Separator,
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

  const canEditAssistant =
    // builders can all edit, non-builders can only edit personal/shared assistants
    isBuilder(owner) || !(agentConfiguration.scope === "workspace");

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

      <Separator orientation="vertical" className="h-6" />

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

      {agentConfiguration.scope !== "global" && (
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
            label={
              canEditAssistant
                ? "Edit this assistant"
                : "Edition of this assistant is restricted"
            }
            labelVisible={false}
            size="sm"
            disabled={!canEditAssistant}
            variant="tertiary"
            hasMagnifying={false}
            icon={PencilSquareIcon}
          />
        </Link>
      )}

      {agentConfiguration.scope !== "global" && (
        <AssistantDropdownMenu
          agentConfiguration={agentConfiguration}
          owner={owner}
          variant="button"
          canDelete
        />
      )}
    </div>
  );
}
