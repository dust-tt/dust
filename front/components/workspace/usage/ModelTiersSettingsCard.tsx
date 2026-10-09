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
import { SettingsList, SliderToggle } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface ModelTiersSettingsCardProps {
  owner: LightWorkspaceType;
}

export function ModelTiersSettingsCard({ owner }: ModelTiersSettingsCardProps) {
  const { t } = useLingui();
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
    <>
      <div className="heading-base text-foreground">
        <Trans>Models tier</Trans>
        <ModelTiersInfoButton />
      </div>
      <SettingsList>
        <SettingsList.Row
          title={t`Workspace access`}
          description={t`Set the highest model tier available to all members of this workspace.`}
          action={
            <ModelTierPickerDropdown
              selectedValue={selectedValue}
              options={getWorkspaceModelTierOptions(t)}
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
          title={t`Published agents`}
          description={t`Allow all members to run published agents even when the agent's model tier is above their own access.`}
          action={
            <SliderToggle
              selected={isRestrictedModelsForPublishedAgentsEnabled}
              disabled={isRestrictedModelsForPublishedAgentsChanging}
              onClick={() => void doTogglePublishedAgentsRestrictedModels()}
            />
          }
        />
      </SettingsList>
    </>
  );
}
