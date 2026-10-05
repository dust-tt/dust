import { DisableProviderDialog } from "@app/components/pages/workspace/model_providers/DisableProviderDialog";
import { ProviderToggleContextItem } from "@app/components/pages/workspace/model_providers/ProviderToggleContextItem";
import type { WhitelistableModelMakerIdType } from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import { ContextItem } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface ProvidersToggleListProps {
  providersSelection: ProvidersSelection;
  onToggleProvider: (provider: WhitelistableModelMakerIdType) => void;
  isWorkspaceValidating: boolean;
  modelsDescriptionByMaker: Partial<
    Record<WhitelistableModelMakerIdType, string>
  >;
}

export function ProvidersToggleList({
  providersSelection,
  onToggleProvider,
  isWorkspaceValidating,
  modelsDescriptionByMaker,
}: ProvidersToggleListProps) {
  const [pendingDisableProvider, setPendingDisableProvider] =
    useState<WhitelistableModelMakerIdType | null>(null);

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
      <ContextItem.List>
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
      </ContextItem.List>
      <DisableProviderDialog
        providerId={pendingDisableProvider}
        onConfirm={handleConfirmDisable}
        onCancel={() => setPendingDisableProvider(null)}
      />
    </>
  );
}
