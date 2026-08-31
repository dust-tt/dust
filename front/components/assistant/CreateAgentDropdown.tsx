import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Brackets,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  File02,
  MagicWand02,
  Plus,
  Spinner,
} from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

interface CreateAgentDropdownContentProps
  extends ComponentProps<typeof DropdownMenuContent> {
  owner: LightWorkspaceType;
  dataGtmLocation: string;
  // Called when an item navigates away (e.g. to close the sidebar).
  onNavigate?: () => void;
}

// The agent creation menu, shared by every "create agent" trigger (sidebar,
// manage agents page) so they all offer the same entries.
export function CreateAgentDropdownContent({
  owner,
  dataGtmLocation,
  onNavigate,
  ...contentProps
}: CreateAgentDropdownContentProps) {
  const { isUploading: isUploadingYAML, triggerYAMLUpload } = useYAMLUpload({
    owner,
  });

  return (
    <DropdownMenuContent align="start" {...contentProps}>
      <DropdownMenuLabel label="New agent" />
      <DropdownMenuItem
        href={getAgentBuilderRoute(owner.sId, "new")}
        icon={File02}
        label="From scratch"
        data-gtm-label="assistantCreationButton"
        data-gtm-location={dataGtmLocation}
        onClick={withTracking(TRACKING_AREAS.BUILDER, "create_from_scratch", () =>
          onNavigate?.()
        )}
      />
      <DropdownMenuItem
        href={getAgentBuilderRoute(owner.sId, "create")}
        icon={MagicWand02}
        label="From template"
        data-gtm-label="assistantCreationButton"
        data-gtm-location={dataGtmLocation}
        onClick={withTracking(TRACKING_AREAS.BUILDER, "create_from_template", () =>
          onNavigate?.()
        )}
      />
      <DropdownMenuItem
        icon={isUploadingYAML ? <Spinner size="xs" /> : Brackets}
        label={isUploadingYAML ? "Uploading..." : "From YAML"}
        disabled={isUploadingYAML}
        onClick={triggerYAMLUpload}
        data-gtm-label="yamlUploadButton"
        data-gtm-location={dataGtmLocation}
      />
    </DropdownMenuContent>
  );
}

interface CreateAgentDropdownProps {
  owner: LightWorkspaceType;
  dataGtmLocation: string;
  isCompact?: boolean;
}

export const CreateAgentDropdown = ({
  owner,
  dataGtmLocation,
  isCompact = false,
}: CreateAgentDropdownProps) => {
  const { hasPermission } = useWorkspacePermissions();

  if (!hasPermission("create", "agent")) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          icon={Plus}
          label={isCompact ? undefined : "Create"}
          tooltip={isCompact ? "Create" : undefined}
          data-gtm-label="assistantCreationButton"
          data-gtm-location={dataGtmLocation}
          onClick={withTracking(TRACKING_AREAS.BUILDER, "create_menu")}
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <CreateAgentDropdownContent
        owner={owner}
        dataGtmLocation={dataGtmLocation}
      />
    </DropdownMenu>
  );
};
