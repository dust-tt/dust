import { DisableProviderDialog } from "@app/components/pages/workspace/model_providers/DisableProviderDialog";
import { ProviderToggleContextItem } from "@app/components/pages/workspace/model_providers/ProviderToggleContextItem";
import { RegionalModelsOnlyToggle } from "@app/components/pages/workspace/model_providers/RegionalModelsOnlyToggle";
import type { WhitelistableModelMakerIdType } from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import type { LightWorkspaceType } from "@app/types/user";

import { SettingsList, SliderToggle } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";
import { useCallback, useState } from "react";

interface ProvidersToggleListProps {
  workspace: LightWorkspaceType;
  providersSelection: ProvidersSelection;
  onToggleProvider: (provider: WhitelistableModelMakerIdType) => void;
  onSelectAll: () => void;
  isWorkspaceValidating: boolean;
  modelsDescriptionByMaker: Partial<
    Record<WhitelistableModelMakerIdType, string>
  >;
}

export function ProvidersToggleList({
  workspace,
  providersSelection,
  onToggleProvider,
  onSelectAll,
  isWorkspaceValidating,
  modelsDescriptionByMaker,
}: ProvidersToggleListProps) {
  const [pendingDisableProvider, setPendingDisableProvider] =
    useState<WhitelistableModelMakerIdType | null>(null);

  const allSelected = Object.values(providersSelection).every(Boolean);

  const handleToggle = useCallback(
    (providerId: WhitelistableModelMakerIdType) => {
      if (providersSelection[providerId]) {
        setPendingDisableProvider(providerId);
      } else {
        onToggleProvider(providerId);
      }
    },
    [providersSelection, onToggleProvider]
  );

  const handleConfirmDisable = useCallback(() => {
    if (pendingDisableProvider) {
      onToggleProvider(pendingDisableProvider);
      setPendingDisableProvider(null);
    }
  }, [pendingDisableProvider, onToggleProvider]);

  return (
    <>
      <SettingsList>
        <RegionalModelsOnlyToggle workspace={workspace} />
        <SettingsList.Row
          title={<Trans>Make all providers available</Trans>}
          action={
            <SliderToggle
              selected={allSelected}
              disabled={allSelected}
              onClick={onSelectAll}
            />
          }
        />

        {(
          Object.entries(modelsDescriptionByMaker) as [
            WhitelistableModelMakerIdType,
            string,
          ][]
        ).map(([providerId, description]) => (
          <ProviderToggleContextItem
            key={providerId}
            providerId={providerId}
            description={description}
            providersSelection={providersSelection}
            handleToggleChange={() => handleToggle(providerId)}
            disabled={isWorkspaceValidating}
          />
        ))}
      </SettingsList>
      <DisableProviderDialog
        providerId={pendingDisableProvider}
        onConfirm={handleConfirmDisable}
        onCancel={() => setPendingDisableProvider(null)}
      />
    </>
  );
}
