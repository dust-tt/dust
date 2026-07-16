import type { EditAdvancedModelsTarget } from "@app/components/workspace/EditAdvancedModelsModal";
import {
  buildAdvancedModelDisplayNameMap,
  formatAdvancedModelsSummary,
} from "@app/lib/client/advanced_models";
import {
  useAdvancedModels,
  useWorkspaceAllowedAdvancedModels,
} from "@app/lib/swr/advanced_models";
import type { LightWorkspaceType } from "@app/types/user";
import { NewButton, Page, SettingsList, Spinner } from "@dust-tt/sparkle";

interface AdvancedModelsSettingsCardProps {
  owner: LightWorkspaceType;
  readOnly: boolean;
  onEditWorkspaceAdvancedModels: (
    target: Extract<EditAdvancedModelsTarget, { scope: "workspace" }>
  ) => void;
}

export function AdvancedModelsSettingsCard({
  owner,
  readOnly,
  onEditWorkspaceAdvancedModels,
}: AdvancedModelsSettingsCardProps) {
  const { models: advancedModelsCatalog, isAdvancedModelsLoading } =
    useAdvancedModels({ owner });
  const {
    models: workspaceAllowedAdvancedModels,
    isWorkspaceAllowedAdvancedModelsLoading,
  } = useWorkspaceAllowedAdvancedModels({ owner });

  const displayNameByKey = buildAdvancedModelDisplayNameMap(
    advancedModelsCatalog
  );
  const summary = formatAdvancedModelsSummary({
    models: workspaceAllowedAdvancedModels,
    displayNameByKey,
  });
  const isLoading =
    isAdvancedModelsLoading || isWorkspaceAllowedAdvancedModelsLoading;

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-base text-foreground dark:text-foreground-night">
        Advanced models
      </span>
      <SettingsList>
        <SettingsList.Row
          title="Workspace access"
          description="Grant advanced models to all members of this workspace."
          action={
            isLoading ? (
              <Spinner size="xs" />
            ) : (
              <NewButton
                label="Edit advanced models"
                variant="outline"
                size="sm"
                disabled={readOnly}
                onClick={() =>
                  onEditWorkspaceAdvancedModels({ scope: "workspace" })
                }
              />
            )
          }
        />
      </SettingsList>
      {!isLoading && (
        <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
          {summary === "--"
            ? "No advanced models enabled for the workspace."
            : `Enabled: ${summary}`}
        </span>
      )}
    </Page.Vertical>
  );
}
