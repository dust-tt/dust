import { Page, ShapesIcon } from "@dust-tt/sparkle";
import type { SubscriptionType, UserType, WorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import React from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AnthropicSetup from "@app/components/providers/AnthropicSetup";
import AzureOpenAISetup from "@app/components/providers/AzureOpenAISetup";
import BrowserlessAPISetup from "@app/components/providers/BrowserlessAPISetup";
import DeepseekSetup from "@app/components/providers/DeepseekSetup";
import GoogleAiStudioSetup from "@app/components/providers/GoogleAiStudioSetup";
import MistralAISetup from "@app/components/providers/MistralAISetup";
import OpenAISetup from "@app/components/providers/OpenAISetup";
import SerpAPISetup from "@app/components/providers/SerpAPISetup";
import SerperSetup from "@app/components/providers/SerperSetup";
import TogetherAISetup from "@app/components/providers/TogetherAISetup";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  APP_MODEL_PROVIDER_IDS,
  modelProviders,
  serviceProviders,
} from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";
import { classNames } from "@app/lib/utils";

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

  const filteredProviders = modelProviders.filter((provider) =>
    filteredProvidersIdSet.has(provider.providerId)
  );

  const renderProviderSetup = (providerId: string) => {
    const enabled = !!configs[providerId];
    const config = configs[providerId] ?? null;

    switch (providerId) {
      case "openai":
        return <OpenAISetup owner={owner} enabled={enabled} config={config} />;
      case "azure_openai":
        return (
          <AzureOpenAISetup owner={owner} enabled={enabled} config={config} />
        );
      case "anthropic":
        return (
          <AnthropicSetup owner={owner} enabled={enabled} config={config} />
        );
      case "mistral":
        return (
          <MistralAISetup owner={owner} enabled={enabled} config={config} />
        );
      case "google_ai_studio":
        return (
          <GoogleAiStudioSetup
            owner={owner}
            enabled={enabled}
            config={config}
          />
        );
      case "togetherai":
        return (
          <TogetherAISetup owner={owner} enabled={enabled} config={config} />
        );
      case "deepseek":
        return (
          <DeepseekSetup owner={owner} enabled={enabled} config={config} />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Page.SectionHeader
        title="Model Providers"
        description="Model providers available to your Dust apps."
      />
      <ul role="list" className="pt-4">
        {filteredProviders.map((provider) => (
          <li key={provider.providerId} className="px-2 py-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center">
                  <p
                    className={classNames(
                      "truncate text-base font-bold",
                      configs[provider.providerId]
                        ? "text-slate-700"
                        : "text-slate-400"
                    )}
                  >
                    {provider.name}
                  </p>
                  <div className="ml-2 mt-0.5 flex flex-shrink-0">
                    <p
                      className={classNames(
                        "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                        configs[provider.providerId]
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      )}
                    >
                      {configs[provider.providerId] ? "enabled" : "disabled"}
                    </p>
                  </div>
                </div>
                {configs[provider.providerId] && (
                  <p className="font-mono text-xs text-element-700">
                    API Key:{" "}
                    <pre>{configs[provider.providerId].redactedApiKey}</pre>
                  </p>
                )}
              </div>
              <div>{renderProviderSetup(provider.providerId)}</div>
            </div>
          </li>
        ))}
      </ul>

      <Page.SectionHeader
        title="Service Providers"
        description="Service providers enable your Dust Apps to query external data or write to external services."
      />
      <ul role="list" className="pt-4">
        {serviceProviders.map((provider) => (
          <li key={provider.providerId} className="px-2 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <p
                  className={classNames(
                    "truncate text-base font-bold",
                    configs[provider.providerId]
                      ? "text-slate-700"
                      : "text-slate-400"
                  )}
                >
                  {provider.name}
                </p>
                <div className="ml-2 mt-0.5 flex flex-shrink-0">
                  <p
                    className={classNames(
                      "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                      configs[provider.providerId]
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    )}
                  >
                    {configs[provider.providerId] ? "enabled" : "disabled"}
                  </p>
                </div>
              </div>
              <div>
                {provider.providerId === "serpapi" && (
                  <SerpAPISetup
                    owner={owner}
                    enabled={!!configs["serpapi"]}
                    config={configs["serpapi"] ?? null}
                  />
                )}
                {provider.providerId === "serper" && (
                  <SerperSetup
                    owner={owner}
                    enabled={!!configs["serper"]}
                    config={configs["serper"] ?? null}
                  />
                )}
                {provider.providerId === "browserlessapi" && (
                  <BrowserlessAPISetup
                    owner={owner}
                    enabled={!!configs["browserlessapi"]}
                    config={configs["browserlessapi"] ?? null}
                  />
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
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
      <div className="h-12" />
    </AppLayout>
  );
}
