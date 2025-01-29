import { Button, Chip, cn, Container, Page, ShapesIcon } from "@dust-tt/sparkle";
import type { SubscriptionType, UserType, WorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import React, { useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import {
  MODEL_PROVIDER_CONFIGS,
  ProviderSetup,
  SERVICE_PROVIDER_CONFIGS,
} from "@app/components/providers/ProviderSetup";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { APP_MODEL_PROVIDER_IDS, modelProviders, serviceProviders } from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();
  const user = auth.getNonNullableUser();
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

      <Container className="w-full h-full bg-background" noPadding>
        <div className="space-y-8">
          <Page.SectionHeader
            title="Model Providers"
            description="Model providers available to your Dust apps."
          />
          <ul role="list">
            {filteredProviders.map((provider) => (
              <li key={provider.providerId} className="py-4">
                <div className="items-center flex justify-between">
                  <div className="flex flex-col gap-1.5">
                    <div className="items-center flex">
                      <p
                        className={cn(
                          "truncate text-base font-bold",
                          configs[provider.providerId]
                            ? "text-slate-700"
                            : "text-slate-400"
                        )}
                      >
                        {provider.name}
                      </p>
                      <div className="ml-2 mt-0.5 flex flex-shrink-0">
                        <Chip
                          size="xs"
                          label={configs[provider.providerId] ? "enabled" : "disabled"}
                          color={configs[provider.providerId] ?"emerald": "slate"}
                        />
                      </div>
                    </div>
                    {configs[provider.providerId] && (
                      <p className="font-mono text-xs text-element-700">
                        API Key:{" "}
                        <pre>{configs[provider.providerId].redactedApiKey}</pre>
                      </p>
                    )}
                  </div>
                  <Button
                    variant={
                      configs[provider.providerId] ? "primary" : "outline"
                    }
                    label={configs[provider.providerId] ? "Edit" : "Set up"}
                    onClick={() => {
                      setIsModelProvider(true);
                      setSelectedProviderId(provider.providerId);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <Page.SectionHeader
            title="Service Providers"
            description="Service providers enable your Dust Apps to query external data or write to external services."
          />
          <ul role="list">
            {serviceProviders.map((provider) => (
              <li key={provider.providerId} className="py-4">
                <div className="items-center flex justify-between">
                  <div className="items-center flex">
                    <p
                      className={cn(
                        "truncate text-base font-bold",
                        configs[provider.providerId]
                          ? "text-slate-700"
                          : "text-slate-400"
                      )}
                    >
                      {provider.name}
                    </p>
                    <div className="ml-2 mt-0.5 flex flex-shrink-0">
                      <Chip
                        size="xs"
                        label={configs[provider.providerId] ? "enabled" : "disabled"}
                        color={configs[provider.providerId] ?"emerald": "slate"}
                      />
                    </div>
                  </div>
                  <Button
                    variant={
                      configs[provider.providerId] ? "primary" : "outline"
                    }
                    label={configs[provider.providerId] ? "Edit" : "Set up"}
                    onClick={() => {
                      setIsModelProvider(false);
                      setSelectedProviderId(provider.providerId);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </>
  );
}

export default function ProvidersPage({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "providers" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Providers"
          icon={ShapesIcon}
          description="Configure model and service providers to enable advanced capabilities in your Apps. Note: These providers are not used by Dust assistants at all, but are required for running your own custom Dust Apps."
        />
        <Page.Vertical align="stretch" gap="md">
          <Providers owner={owner} />
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}
