import {
  Button,
  Chip,
  cn,
  Container,
  Page,
  ShapesIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import React, { useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import {
  MODEL_PROVIDER_CONFIGS,
  ProviderSetup,
  SERVICE_PROVIDER_CONFIGS,
} from "@app/components/providers/ProviderSetup";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  APP_MODEL_PROVIDER_IDS,
  modelProviders,
  serviceProviders,
} from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";
import type { SubscriptionType, UserType, WorkspaceType } from "@app/types";
import { redactString } from "@app/types";
export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();
  const user = auth.getNonNullableUser().toJSON();
  if (!auth.isAdmin()) {
    return { notFound: true };
  }
  return {
    props: {
      owner,
      subscription,
      user,
    },
  };
});

export function Providers({ owner }: { owner: WorkspaceType }) {
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
          <div>
            <Page.SectionHeader
              title="Model Providers"
              description="Model providers available to your Dust apps."
            />
            <ul
              role="list"
              className="divide-y divide-separator pt-4 dark:divide-separator-night"
            >
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

          <div>
            <Page.SectionHeader
              title="Service Providers"
              description="Service providers enable your Dust Apps to query external data or write to external services."
            />
            <ul
              role="list"
              className="divide-y divide-separator pt-4 dark:divide-separator-night"
            >
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
        </div>
      </Container>
    </>
  );
}

function ProviderListItem({
  name,
  isEnabled,
  apiKey,
  onAction,
}: {
  name: string;
  isEnabled: boolean;
  apiKey?: string;
  onAction: () => void;
}) {
  return (
    <li className="py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "heading-base truncate",
                isEnabled
                  ? "text-foreground dark:text-foreground-night"
                  : "text-primary-500 dark:text-primary-500-night"
              )}
            >
              {name}
            </p>
            <Chip
              size="xs"
              label={isEnabled ? "enabled" : "disabled"}
              color={isEnabled ? "success" : "primary"}
            />
          </div>
          {apiKey && (
            <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground dark:text-muted-foreground-night">
              <span className="shrink-0">API Key:</span>
              <div className="dd-privacy-mask max-w-72 truncate">
                {redactString(apiKey, 4)}
              </div>
            </div>
          )}
        </div>
        <Button
          variant={isEnabled ? "primary" : "outline"}
          label={isEnabled ? "Edit" : "Set up"}
          onClick={onAction}
        />
      </div>
    </li>
  );
}

export default function ProvidersPage({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "providers" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Providers"
          icon={ShapesIcon}
          description="Configure model and service providers to enable advanced capabilities in your Apps. Note: These providers are not used by Dust agents at all, but are required for running your own custom Dust Apps."
        />
        <Page.Vertical align="stretch" gap="md">
          <Providers owner={owner} />
        </Page.Vertical>
      </Page.Vertical>
    </AppCenteredLayout>
  );
}

ProvidersPage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
