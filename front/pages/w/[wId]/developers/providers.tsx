import { Button, Page, ShapesIcon } from "@dust-tt/sparkle";
import type { SubscriptionType, UserType, WorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import React, { useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { ProviderSetup } from "@app/components/providers/ProviderSetup";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  APP_MODEL_PROVIDER_IDS,
  modelProviders,
  serviceProviders,
} from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";
import { classNames } from "@app/lib/utils";

type ProviderConfig = {
  title: string;
  fields: {
    name: string;
    placeholder: string;
    type?: string;
  }[];
  instructions: React.ReactNode;
};

const MODEL_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    title: "OpenAI",
    fields: [{ name: "api_key", placeholder: "OpenAI API Key" }],
    instructions: (
      <>
        <p>
          To use OpenAI models you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-action-600 hover:text-action-500"
            href="https://platform.openai.com/account/api-keys"
            target="_blank"
          >
            here
          </a>
          .
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  azure_openai: {
    title: "Azure OpenAI",
    fields: [
      { name: "endpoint", placeholder: "Azure OpenAI Endpoint" },
      { name: "api_key", placeholder: "Azure OpenAI API Key" },
    ],
    instructions: (
      <>
        <p>
          To use Azure OpenAI models you must provide your API key and Endpoint.
          They can be found in the left menu of your OpenAI Azure Resource
          portal (menu item `Keys and Endpoint`).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  anthropic: {
    title: "Anthropic",
    fields: [{ name: "api_key", placeholder: "Anthropic API Key" }],
    instructions: (
      <>
        <p>
          To use Anthropic models you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-action-600 hover:text-action-500"
            href="https://console.anthropic.com/account/keys"
            target="_blank"
          >
            here
          </a>
          &nbsp;(you can create a new key specifically for Dust).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  mistral: {
    title: "Mistral AI",
    fields: [{ name: "api_key", placeholder: "Mistral AI API Key" }],
    instructions: (
      <>
        <p>
          To use Mistral AI models you must provide your API key. It can be
          found{" "}
          <a
            className="font-bold text-action-600 hover:text-action-500"
            href="https://console.mistral.ai/api-keys/"
            target="_blank"
          >
            here
          </a>
          &nbsp;(you can create a new key specifically for Dust).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  google_ai_studio: {
    title: "Google AI Studio",
    fields: [{ name: "api_key", placeholder: "Google AI Studio API Key" }],
    instructions: (
      <>
        <p>
          To use Google AI Studio models you must provide your API key. It can
          be found{" "}
          <a
            className="font-bold text-action-600 hover:text-action-500"
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
          >
            here
          </a>
          &nbsp;(you can create a new key specifically for Dust).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  togetherai: {
    title: "TogetherAI",
    fields: [{ name: "api_key", placeholder: "TogetherAI API Key" }],
    instructions: (
      <>
        <p>To use TogetherAI models you must provide your API key.</p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  deepseek: {
    title: "Deepseek",
    fields: [{ name: "api_key", placeholder: "Deepseek API Key" }],
    instructions: (
      <>
        <p>To use Deepseek models you must provide your API key.</p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
};

const SERVICE_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  serpapi: {
    title: "SerpAPI Search",
    fields: [{ name: "api_key", placeholder: "SerpAPI API Key" }],
    instructions: (
      <>
        <p>
          SerpAPI lets you search Google (and other search engines). To use
          SerpAPI you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-action-600 hover:text-action-500"
            href="https://serpapi.com/manage-api-key"
            target="_blank"
          >
            here
          </a>
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  serper: {
    title: "Serper Search",
    fields: [{ name: "api_key", placeholder: "Serper API Key" }],
    instructions: (
      <>
        <p>
          Serper lets you search Google (and other search engines). To use
          Serper you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-action-600 hover:text-action-500"
            href="https://serper.dev/api-key"
            target="_blank"
          >
            here
          </a>
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
  browserlessapi: {
    title: "Browserless API",
    fields: [{ name: "api_key", placeholder: "Browserless API Key" }],
    instructions: (
      <>
        <p>
          Browserless lets you use headless browsers to scrape web content. To
          use Browserless, you must provide your API key. It can be found{" "}
          <a
            className="font-bold text-action-600 hover:text-action-500"
            href="https://cloud.browserless.io/account/"
            target="_blank"
          >
            here
          </a>
          .
        </p>
        <p className="mt-2">
          Note that it generally takes <span className="font-bold">5 mins</span>{" "}
          for the API key to become active (an email is sent when it's ready).
        </p>
        <p className="mt-2">
          We'll never use your API key for anything other than to run your apps.
        </p>
      </>
    ),
  },
};

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
              <Button
                variant={configs[provider.providerId] ? "primary" : "outline"}
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
              <Button
                variant={configs[provider.providerId] ? "ghost" : "outline"}
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
