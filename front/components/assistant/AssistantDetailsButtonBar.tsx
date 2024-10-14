import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useState } from "react";

import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import { AssistantDetailsDropdownMenu } from "@app/components/assistant/AssistantDetailsDropdownMenu";
import { Button } from "@dust-tt/sparkle";
import { StarIcon } from "lucide-react";

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
        icon={StarIcon}
        label="Actions"
        labelVisible={false}
        size="sm"
        variant="tertiary"
        hasMagnifying={false}
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
