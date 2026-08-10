import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import { useAppRouter } from "@app/lib/platform";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import {
  getAgentBuilderRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  File02,
  FolderOpen,
  MagicWand02,
  Plus,
  PuzzlePiece01,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface CreateDropdownProps {
  owner: LightWorkspaceType;
  dataGtmLocation: string;
  isCompact?: boolean;
}

export const CreateDropdown = ({
  owner,
  dataGtmLocation,
  isCompact = false,
}: CreateDropdownProps) => {
  const router = useAppRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isImportSkillDialogOpen, setIsImportSkillDialogOpen] = useState(false);
  const { isUploading: isUploadingYAML, triggerYAMLUpload } = useYAMLUpload({
    owner,
  });
  const { hasPermission } = useWorkspacePermissions();

  const canCreateAgent = hasPermission("create", "agent");
  const canCreateSkill = hasPermission("create", "skill");

  // The section labels only disambiguate when both groups are listed.
  const showSectionLabels = canCreateAgent && canCreateSkill;

  // Each group is gated on its own permission, so the button itself is only
  // worth showing when there is at least one thing the user can create.
  if (!canCreateAgent && !canCreateSkill) {
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
          isLoading={isLoading}
          disabled={isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {canCreateAgent && (
          <>
            {showSectionLabels && <DropdownMenuLabel label="Agents" />}
            <DropdownMenuItem
              label="agent from scratch"
              icon={File02}
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
              icon={MagicWand02}
              onClick={withTracking(
                TRACKING_AREAS.BUILDER,
                "create_from_template",
                () => {
                  setIsLoading(true);
                  void router.push(getAgentBuilderRoute(owner.sId, "create"));
                }
              )}
            />
            <DropdownMenuItem
              label={isUploadingYAML ? "Uploading..." : "agent from YAML"}
              icon={isUploadingYAML ? <Spinner size="xs" /> : FolderOpen}
              disabled={isUploadingYAML}
              onClick={triggerYAMLUpload}
            />
          </>
        )}
        {canCreateSkill && (
          <>
            {showSectionLabels && <DropdownMenuLabel label="Skills" />}
            <DropdownMenuItem
              label="skill from scratch"
              icon={PuzzlePiece01}
              onClick={withTracking(
                TRACKING_AREAS.BUILDER,
                "create_skill",
                () => {
                  setIsLoading(true);
                  void router.push(getSkillBuilderRoute(owner.sId, "new"));
                }
              )}
            />
            <DropdownMenuItem
              label="skill from existing"
              icon={FolderOpen}
              onClick={() => setIsImportSkillDialogOpen(true)}
            />
          </>
        )}
      </DropdownMenuContent>
      {isImportSkillDialogOpen && (
        <ImportSkillsDialog
          onClose={() => setIsImportSkillDialogOpen(false)}
          owner={owner}
        />
      )}
    </DropdownMenu>
  );
};
