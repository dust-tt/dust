import { DisableProviderDialog } from "@app/components/pages/workspace/model_providers/DisableProviderDialog";
import { ProviderToggleContextItem } from "@app/components/pages/workspace/model_providers/ProviderToggleContextItem";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import { ContextItem } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface ProvidersToggleListProps {
  providersSelection: ProvidersSelection;
  onToggleProvider: (provider: ModelProviderIdType) => void;
  isWorkspaceValidating: boolean;
  modelsDescriptionByProvider: Partial<Record<ModelProviderIdType, string>>;
}

export function ProvidersToggleList({
  providersSelection,
  onToggleProvider,
  isWorkspaceValidating,
  modelsDescriptionByProvider,
}: ProvidersToggleListProps) {
  const [pendingDisableProvider, setPendingDisableProvider] =
    useState<ModelProviderIdType | null>(null);

  const handleToggle = useCallback(
    (providerId: ModelProviderIdType) => {
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
          Object.entries(modelsDescriptionByProvider) as [
            ModelProviderIdType,
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
