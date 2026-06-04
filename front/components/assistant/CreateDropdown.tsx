import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import { useAppRouter } from "@app/lib/platform";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import {
  getAgentBuilderRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  File02V2,
  FolderOpenV2,
  MagicWand02V2,
  PlusV2,
  PuzzlePiece01V2,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface CreateDropdownProps {
  owner: LightWorkspaceType;
  dataGtmLocation: string;
}

export const CreateDropdown = ({
  owner,
  dataGtmLocation,
}: CreateDropdownProps) => {
  const router = useAppRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isImportSkillDialogOpen, setIsImportSkillDialogOpen] = useState(false);
  const { isUploading: isUploadingYAML, triggerYAMLUpload } = useYAMLUpload({
    owner,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          icon={PlusV2}
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
        {isBuilder(owner) && <DropdownMenuLabel label="Agents" />}
        <DropdownMenuItem
          label="agent from scratch"
          icon={File02V2}
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
          icon={MagicWand02V2}
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
          icon={isUploadingYAML ? <Spinner size="xs" /> : FolderOpenV2}
          disabled={isUploadingYAML}
          onClick={triggerYAMLUpload}
        />
        {isBuilder(owner) && (
          <>
            <DropdownMenuLabel label="Skills" />
            <DropdownMenuItem
              label="skill from scratch"
              icon={PuzzlePiece01V2}
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
              icon={FolderOpenV2}
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
