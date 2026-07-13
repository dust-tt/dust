import { ModelTierPickerDropdown } from "@app/components/workspace/ModelTierPickerDropdown";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import { getWorkspaceModelTierOptions } from "@app/lib/client/model_tier_options";
import { DEFAULT_MAX_MODEL_TIER } from "@app/lib/model_tiers/tier_order";
import {
  useWorkspaceAllowedModelTierMutations,
  useWorkspaceAllowedModelTiers,
} from "@app/lib/swr/model_tiers";
import type { LightWorkspaceType } from "@app/types/user";
import { Page, SettingsList } from "@dust-tt/sparkle";

interface ModelTiersSettingsCardProps {
  owner: LightWorkspaceType;
  readOnly: boolean;
}

export function ModelTiersSettingsCard({
  owner,
  readOnly,
}: ModelTiersSettingsCardProps) {
  const {
    maxTierName: workspaceMaxTierName,
    isWorkspaceAllowedModelTiersLoading,
  } = useWorkspaceAllowedModelTiers({ owner });
  const { setWorkspaceAllowedModelTier, isWorkspaceAllowedModelTierMutating } =
    useWorkspaceAllowedModelTierMutations({ owner });

  const selectedValue = workspaceMaxTierName ?? DEFAULT_MAX_MODEL_TIER;

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-base text-foreground dark:text-foreground-night">
        Models tier
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
              readOnly={readOnly}
              isLoading={isWorkspaceAllowedModelTiersLoading}
              isMutating={isWorkspaceAllowedModelTierMutating}
            />
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
