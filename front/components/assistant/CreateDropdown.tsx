import { ImportSkillsDialog } from "@app/components/skills/ImportSkillsDialog";
import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import {
  getAgentBuilderRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import {
  DocumentIcon,
  MagicIcon,
  PlusIcon,
  PuzzleIcon,
} from "@app/components/assistant/conversation/icons";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  FolderOpenIcon,
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

  const { hasFeature } = useFeatureFlags();

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
        {isBuilder(owner) && <DropdownMenuLabel label="Agents" />}
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
        {isBuilder(owner) && (
          <>
            <DropdownMenuLabel label="Skills" />
            <DropdownMenuItem
              label={
                hasFeature("sandbox_tools") ? "skill from scratch" : "skill"
              }
              icon={PuzzleIcon}
              onClick={withTracking(
                TRACKING_AREAS.BUILDER,
                "create_skill",
                () => {
                  setIsLoading(true);
                  void router.push(getSkillBuilderRoute(owner.sId, "new"));
                }
              )}
            />
            {hasFeature("sandbox_tools") && (
              <DropdownMenuItem
                label="skill from existing"
                icon={FolderOpenIcon}
                onClick={() => setIsImportSkillDialogOpen(true)}
              />
            )}
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
