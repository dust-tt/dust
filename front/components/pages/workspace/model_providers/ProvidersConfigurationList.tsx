import { ProviderConfigurationContextItem } from "@app/components/pages/workspace/model_providers/ProviderConfigurationContextItem";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import { ContextItem } from "@dust-tt/sparkle";

interface ProvidersConfigurationListProps {
  owner: LightWorkspaceType;
  modelsDescriptionByProvider: Partial<Record<ByokModelProviderIdType, string>>;
}

export function ProvidersConfigurationList({
  owner,
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
          owner={owner}
          providerId={providerId}
          description={description}
        />
      ))}
    </ContextItem.List>
  );
}
