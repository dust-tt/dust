import { ProviderToggleContextItem } from "@app/components/pages/workspace/model_providers/ProviderToggleContextItem";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import { ContextItem } from "@dust-tt/sparkle";

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
          handleToggleChange={() => onToggleProvider(providerId)}
          disabled={isWorkspaceValidating}
        />
      ))}
    </ContextItem.List>
  );
}
