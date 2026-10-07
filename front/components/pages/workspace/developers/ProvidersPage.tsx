import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import {
  MODEL_PROVIDER_CONFIGS,
  ProviderSetup,
  SERVICE_PROVIDER_CONFIGS,
} from "@app/components/providers/ProviderSetup";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import {
  APP_MODEL_PROVIDER_IDS,
  modelProviders,
  serviceProviders,
} from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";
import { redactString } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import { Button, Chip, Container, cn, Page } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface ProvidersProps {
  owner: WorkspaceType;
}

export function Providers({ owner }: ProvidersProps) {
  const { t } = useLingui();
  const { providers, isProvidersLoading, isProvidersError } = useProviders({
    owner,
  });
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  );
  const [isModelProvider, setIsModelProvider] = useState(true);

  const appWhiteListedProviders = owner.whiteListedProviders
    ? [...owner.whiteListedProviders, "azure_openai"]
    : APP_MODEL_PROVIDER_IDS;

  const filteredProvidersIdSet = new Set(
    modelProviders
      .filter(
        (provider) =>
          APP_MODEL_PROVIDER_IDS.includes(provider.providerId) &&
          appWhiteListedProviders.includes(provider.providerId)
      )
      .map((provider) => provider.providerId)
  );

  const configs = {} as any;
  if (!isProvidersLoading && !isProvidersError) {
    for (const provider of providers) {
      const { api_key, ...rest } = JSON.parse(provider.config);
      configs[provider.providerId] = {
        ...rest,
        api_key: "",
        redactedApiKey: api_key,
      };
      filteredProvidersIdSet.add(provider.providerId);
    }
  }

  const filteredProviders = modelProviders.filter((p) =>
    filteredProvidersIdSet.has(p.providerId)
  );

  const selectedConfig = selectedProviderId
    ? isModelProvider
      ? MODEL_PROVIDER_CONFIGS[selectedProviderId]
      : SERVICE_PROVIDER_CONFIGS[selectedProviderId]
    : null;

  const enabled =
    selectedProviderId && configs[selectedProviderId]
      ? !!configs[selectedProviderId]
      : false;

  const configForSelected =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    (selectedProviderId && configs[selectedProviderId]) || {};

  return (
    <>
      {selectedProviderId && selectedConfig && (
        <ProviderSetup
          owner={owner}
          providerId={selectedProviderId}
          title={selectedConfig.title}
          instructions={selectedConfig.instructions}
          fields={selectedConfig.fields}
          config={configForSelected}
          enabled={enabled}
          isOpen={true}
          onClose={() => setSelectedProviderId(null)}
        />
      )}

      <Container className="h-full w-full" noPadding>
        <div className="space-y-8">
          <AdminSectionAnchor
            sectionId={ADMIN_SECTION_IDS.appCredentials.modelProviders}
          >
            <div>
              <Page.SectionHeader
                title={t`Model Providers`}
                description={t`Model providers available to your Dust apps.`}
              />
              <ul role="list" className="divide-y divide-separator pt-4">
                {filteredProviders.map((provider) => (
                  <ProviderListItem
                    key={provider.providerId}
                    name={provider.name}
                    isEnabled={!!configs[provider.providerId]}
                    apiKey={configs[provider.providerId]?.redactedApiKey}
                    onAction={() => {
                      setIsModelProvider(true);
                      setSelectedProviderId(provider.providerId);
                    }}
                  />
                ))}
              </ul>
            </div>
          </AdminSectionAnchor>

          <AdminSectionAnchor
            sectionId={ADMIN_SECTION_IDS.appCredentials.serviceProviders}
          >
            <div>
              <Page.SectionHeader
                title={t`Service Providers`}
                description={t`Service providers enable your Dust Apps to query external data or write to external services.`}
              />
              <ul role="list" className="divide-y divide-separator pt-4">
                {serviceProviders.map((provider) => (
                  <ProviderListItem
                    key={provider.providerId}
                    name={provider.name}
                    isEnabled={!!configs[provider.providerId]}
                    apiKey={configs[provider.providerId]?.redactedApiKey}
                    onAction={() => {
                      setIsModelProvider(false);
                      setSelectedProviderId(provider.providerId);
                    }}
                  />
                ))}
              </ul>
            </div>
          </AdminSectionAnchor>
        </div>
      </Container>
    </>
  );
}

interface ProviderListItemProps {
  name: string;
  isEnabled: boolean;
  apiKey?: string;
  onAction: () => void;
}

function ProviderListItem({
  name,
  isEnabled,
  apiKey,
  onAction,
}: ProviderListItemProps) {
  const { t } = useLingui();
  return (
    <li className="py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "heading-base truncate",
                isEnabled ? "text-foreground" : "text-primary-500"
              )}
            >
              {name}
            </p>
            <Chip
              size="xs"
              label={isEnabled ? t`enabled` : t`disabled`}
              color={isEnabled ? "success" : "primary"}
            />
          </div>
          {apiKey && (
            <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <span className="shrink-0">
                <Trans>API Key:</Trans>
              </span>
              <div className="dd-privacy-mask max-w-72 truncate">
                {redactString(apiKey, 4)}
              </div>
            </div>
          )}
        </div>
        <Button
          variant={isEnabled ? "primary" : "outline"}
          label={isEnabled ? t`Edit` : t`Set up`}
          onClick={onAction}
        />
      </div>
    </li>
  );
}
