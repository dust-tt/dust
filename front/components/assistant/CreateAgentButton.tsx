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
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";
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
          onClick={() =>
            trackEvent({
              area: TRACKING_AREAS.BUILDER,
              object: "create_menu",
              action: "click",
            })
          }
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
          onClick={() => {
            trackEvent({
              area: TRACKING_AREAS.BUILDER,
              object: "create_from_scratch",
              action: "click",
            });
            setIsLoading(true);
            void router.push(getAgentBuilderRoute(owner.sId, "new"));
          }}
        />
        <DropdownMenuItem
          label="agent from template"
          icon={MagicIcon}
          onClick={() => {
            trackEvent({
              area: TRACKING_AREAS.BUILDER,
              object: "create_from_template",
              action: "click",
            });
            setIsLoading(true);
            void router.push(getAgentBuilderRoute(owner.sId, "create"));
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
