import {
  Button,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderOpenIcon,
  MagicIcon,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useState } from "react";

import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
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
  const { isUploading: isUploadingYAML, triggerYAMLUpload } = useYAMLUpload({
    owner,
  });

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

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
          disabled={isLoading}
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
        {hasFeature("agent_to_yaml") && (
          <DropdownMenuItem
            label={isUploadingYAML ? "Uploading..." : "agent from YAML"}
            icon={isUploadingYAML ? <Spinner size="xs" /> : FolderOpenIcon}
            disabled={isUploadingYAML}
            onClick={triggerYAMLUpload}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
