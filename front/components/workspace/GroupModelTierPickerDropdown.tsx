import { ModelTierPickerDropdown } from "@app/components/workspace/ModelTierPickerDropdown";
import {
  getGroupModelTierOptions,
  NO_GROUP_MODEL_TIER,
} from "@app/lib/client/model_tier_options";
import {
  useGroupAllowedModelTierMutations,
  useGroupAllowedModelTiers,
} from "@app/lib/swr/model_tiers";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import type { LightWorkspaceType } from "@app/types/user";
import type { ButtonVariantType } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface GroupModelTierPickerDropdownProps {
  owner: LightWorkspaceType;
  groupId: string;
  variant?: ButtonVariantType;
}

export function GroupModelTierPickerDropdown({
  owner,
  groupId,
  variant,
}: GroupModelTierPickerDropdownProps) {
  const { t } = useLingui();
  const { groups: groupAllowedModelTiers, isGroupAllowedModelTiersLoading } =
    useGroupAllowedModelTiers({ owner });
  const {
    setGroupAllowedModelTier,
    clearGroupAllowedModelTier,
    isGroupAllowedModelTierMutating,
  } = useGroupAllowedModelTierMutations({ owner });

  const selectedValue =
    groupAllowedModelTiers.find((entry) => entry.groupId === groupId)
      ?.maxTierName ?? NO_GROUP_MODEL_TIER;

  return (
    <ModelTierPickerDropdown
      selectedValue={selectedValue}
      options={getGroupModelTierOptions(t)}
      onSelect={async (value) => {
        if (value === NO_GROUP_MODEL_TIER) {
          await clearGroupAllowedModelTier({ groupId });
          return;
        }

        await setGroupAllowedModelTier({
          groupId,
          tierName: value as ModelsTierName,
        });
      }}
      isLoading={isGroupAllowedModelTiersLoading}
      isMutating={isGroupAllowedModelTierMutating}
      variant={variant}
    />
  );
}
