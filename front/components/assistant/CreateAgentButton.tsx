import {
  Button,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MagicIcon,
  PlusIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useState } from "react";

import type { LightWorkspaceType } from "@app/types";

interface CreateAgentButtonProps {
  owner: LightWorkspaceType;
  dataGtmLocation: string;
}

export const CreateAgentButton = ({
  owner,
  dataGtmLocation,
}: CreateAgentButtonProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          icon={PlusIcon}
          label="Create"
          data-gtm-label="assistantCreationButton"
          data-gtm-location={dataGtmLocation}
          size="sm"
          isSelect
          isLoading={isLoading}
          isDisabled={isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="agent from scratch"
          icon={DocumentIcon}
          onClick={() => {
            setIsLoading(true);
            void router.push(
              `/w/${owner.sId}/builder/assistants/new?flow=personal_assistants`
            );
          }}
        />
        <DropdownMenuItem
          label="agent from template"
          icon={MagicIcon}
          onClick={() => {
            setIsLoading(true);
            void router.push(
              `/w/${owner.sId}/builder/assistants/create?flow=personal_assistants`
            );
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
