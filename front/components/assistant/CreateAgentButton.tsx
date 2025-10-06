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
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
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
          onClick={withTracking(TRACKING_AREAS.BUILDER, "create_menu")}
          size="sm"
          isSelect
          isLoading={isLoading}
          disabled={isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          label="agent from scratch"
          icon={DocumentIcon}
          onClick={withTracking(
            TRACKING_AREAS.BUILDER,
            "create_from_scratch",
            () => {
              setIsLoading(true);
              void router.push(getAgentBuilderRoute(owner.sId, "new"));
            }
          )}
        />
        <DropdownMenuItem
          label="agent from template"
          icon={MagicIcon}
          onClick={withTracking(
            TRACKING_AREAS.BUILDER,
            "create_from_template",
            () => {
              setIsLoading(true);
              void router.push(getAgentBuilderRoute(owner.sId, "create"));
            }
          )}
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
