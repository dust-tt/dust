import { ModelTierPickerDropdown } from "@app/components/workspace/ModelTierPickerDropdown";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import { usePublishedAgentsRestrictedModelsToggle } from "@app/hooks/usePublishedAgentsRestrictedModelsToggle";
import { getWorkspaceModelTierOptions } from "@app/lib/client/model_tier_options";
import { DEFAULT_MAX_MODEL_TIER } from "@app/lib/model_tiers/tier_order";
import {
  useWorkspaceAllowedModelTierMutations,
  useWorkspaceAllowedModelTiers,
} from "@app/lib/swr/model_tiers";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import type { LightWorkspaceType } from "@app/types/user";
import { Page, SettingsList, SliderToggle } from "@dust-tt/sparkle";

interface ModelTiersSettingsCardProps {
  owner: LightWorkspaceType;
}

export function ModelTiersSettingsCard({ owner }: ModelTiersSettingsCardProps) {
  const {
    maxTierName: workspaceMaxTierName,
    isWorkspaceAllowedModelTiersLoading,
  } = useWorkspaceAllowedModelTiers({ owner });
  const { setWorkspaceAllowedModelTier, isWorkspaceAllowedModelTierMutating } =
    useWorkspaceAllowedModelTierMutations({ owner });
  const {
    isEnabled: isRestrictedModelsForPublishedAgentsEnabled,
    isChanging: isRestrictedModelsForPublishedAgentsChanging,
    doTogglePublishedAgentsRestrictedModels,
  } = usePublishedAgentsRestrictedModelsToggle({ owner });

  const selectedValue = workspaceMaxTierName ?? DEFAULT_MAX_MODEL_TIER;

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="flex items-center gap-1 heading-base text-foreground dark:text-foreground-night">
        Models tier
        <ModelTiersInfoButton />
      </span>
      <SettingsList>
        <SettingsList.Row
          title="Workspace access"
          description="Set the highest model tier available to all members of this workspace."
          action={
            <ModelTierPickerDropdown
              selectedValue={selectedValue}
              options={getWorkspaceModelTierOptions()}
              onSelect={async (value) => {
                await setWorkspaceAllowedModelTier({
                  tierName: value as ModelsTierName,
                });
              }}
              isLoading={isWorkspaceAllowedModelTiersLoading}
              isMutating={isWorkspaceAllowedModelTierMutating}
            />
          }
        />
        <SettingsList.Row
          title="Published agents"
          description="Allow all members to run published agents even when the agent's model tier is above their own access."
          action={
            <SliderToggle
              selected={isRestrictedModelsForPublishedAgentsEnabled}
              disabled={isRestrictedModelsForPublishedAgentsChanging}
              onClick={() => void doTogglePublishedAgentsRestrictedModels()}
            />
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
