import { ProviderConfigurationContextItem } from "@app/components/pages/workspace/model_providers/ProviderConfigurationContextItem";
import { useProviderCredentials } from "@app/lib/swr/provider_credentials";
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
  const { isProviderCredentialsLoading } = useProviderCredentials({ owner });

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
          isLoading={isProviderCredentialsLoading}
        />
      ))}
    </ContextItem.List>
  );
}
