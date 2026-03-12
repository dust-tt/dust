import { ProviderConfigurationContextItem } from "@app/components/pages/workspace/model_providers/ProviderConfigurationContextItem";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import { ContextItem } from "@dust-tt/sparkle";

interface ProvidersConfigurationListProps {
  modelsDescriptionByProvider: Partial<Record<ByokModelProviderIdType, string>>;
}

export function ProvidersConfigurationList({
  modelsDescriptionByProvider,
}: ProvidersConfigurationListProps) {
  return (
    <ContextItem.List>
      {(
        Object.entries(modelsDescriptionByProvider) as [
          ByokModelProviderIdType,
          string,
        ][]
      ).map(([providerId, description]) => (
        <ProviderConfigurationContextItem
          key={providerId}
          providerId={providerId}
          description={description}
        />
      ))}
    </ContextItem.List>
  );
}
