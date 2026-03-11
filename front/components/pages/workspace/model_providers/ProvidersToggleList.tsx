import { ProviderToggleContextItem } from "@app/components/pages/workspace/model_providers/ProviderToggleContextItem";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import { ContextItem } from "@dust-tt/sparkle";
import { type Dispatch, type SetStateAction, useCallback } from "react";

interface ProvidersToggleListProps {
  providersSelection: ProvidersSelection;
  setProvidersSelection: Dispatch<SetStateAction<ProvidersSelection>>;
  isWorkspaceValidating: boolean;
  modelsDescriptionByProvider: Partial<Record<ModelProviderIdType, string>>;
}

export function ProvidersToggleList({
  providersSelection,
  setProvidersSelection,
  isWorkspaceValidating,
  modelsDescriptionByProvider,
}: ProvidersToggleListProps) {
  const toggleProvider = useCallback(
    (provider: ModelProviderIdType) => {
      setProvidersSelection((previousSelection: ProvidersSelection) => ({
        ...previousSelection,
        [provider]: !previousSelection[provider],
      }));
    },
    [setProvidersSelection]
  );

  return (
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
          handleToggleChange={() => toggleProvider(providerId)}
          disabled={isWorkspaceValidating}
        />
      ))}
    </ContextItem.List>
  );
}
