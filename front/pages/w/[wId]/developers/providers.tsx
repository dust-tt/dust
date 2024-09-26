import { Button, Page, ShapesIcon } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import React from "react";
import { useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AnthropicSetup from "@app/components/providers/AnthropicSetup";
import AzureOpenAISetup from "@app/components/providers/AzureOpenAISetup";
import BrowserlessAPISetup from "@app/components/providers/BrowserlessAPISetup";
import GoogleAiStudioSetup from "@app/components/providers/GoogleAiStudioSetup";
import MistralAISetup from "@app/components/providers/MistralAISetup";
import OpenAISetup from "@app/components/providers/OpenAISetup";
import SerpAPISetup from "@app/components/providers/SerpAPISetup";
import SerperSetup from "@app/components/providers/SerperSetup";
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
    return {
      notFound: true,
    };
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
  const [openAIOpen, setOpenAIOpen] = useState(false);
  const [azureOpenAIOpen, setAzureOpenAIOpen] = useState(false);
  const [anthropicOpen, setAnthropicOpen] = useState(false);
  const [mistalAIOpen, setMistralAiOpen] = useState(false);
  const [googleAiStudioOpen, setGoogleAiStudioOpen] = useState(false);
  const [serpapiOpen, setSerpapiOpen] = useState(false);
  const [serperOpen, setSerperOpen] = useState(false);
  const [browserlessapiOpen, setBrowserlessapiOpen] = useState(false);

  const { providers, isProvidersLoading, isProvidersError } = useProviders({
    owner,
  });

  const appWhiteListedProviders = owner.whiteListedProviders
    ? [...owner.whiteListedProviders, "azure_openai"]
    : APP_MODEL_PROVIDER_IDS;
  const filteredProvidersIdSet = new Set(
    modelProviders
      .filter((provider) => {
        return (
          APP_MODEL_PROVIDER_IDS.includes(provider.providerId) &&
          appWhiteListedProviders.includes(provider.providerId)
        );
      })
      .map((provider) => provider.providerId)
  );

  const configs = {} as any;

  if (!isProvidersLoading && !isProvidersError) {
    for (let i = 0; i < providers.length; i++) {
      // Extract API key and hide it from the config object to be displayed.
      // Store the original API key in a separate property for display use.
      const { api_key, ...rest } = JSON.parse(providers[i].config);
      configs[providers[i].providerId] = {
        ...rest,
        api_key: "",
        redactedApiKey: api_key,
      };
      filteredProvidersIdSet.add(providers[i].providerId);
    }
  }
  const filteredProviders = modelProviders.filter((provider) =>
    filteredProvidersIdSet.has(provider.providerId)
  );
  return (
    <>
      <OpenAISetup
        owner={owner}
        open={openAIOpen}
        setOpen={setOpenAIOpen}
        enabled={!!configs["openai"]}
        config={configs["openai"] ?? null}
      />
      <AzureOpenAISetup
        owner={owner}
        open={azureOpenAIOpen}
        setOpen={setAzureOpenAIOpen}
        enabled={!!configs["azure_openai"]}
        config={configs["azure_openai"] ?? null}
      />
      <AnthropicSetup
        owner={owner}
        open={anthropicOpen}
        setOpen={setAnthropicOpen}
        enabled={!!configs["anthropic"]}
        config={configs["anthropic"] ?? null}
      />
      <MistralAISetup
        owner={owner}
        open={mistalAIOpen}
        setOpen={setMistralAiOpen}
        enabled={configs["mistral"] ? true : false}
        config={configs["mistral"] ? configs["mistral"] : null}
      />
      <GoogleAiStudioSetup
        owner={owner}
        open={googleAiStudioOpen}
        setOpen={setGoogleAiStudioOpen}
        enabled={!!configs["google_ai_studio"]}
        config={configs["google_ai_studio"] ?? null}
      />
      <SerpAPISetup
        owner={owner}
        open={serpapiOpen}
        setOpen={setSerpapiOpen}
        enabled={!!configs["serpapi"]}
        config={configs["serpapi"] ?? null}
      />
      <SerperSetup
        owner={owner}
        open={serperOpen}
        setOpen={setSerperOpen}
        enabled={!!configs["serper"]}
        config={configs["serper"] ?? null}
      />
      <BrowserlessAPISetup
        owner={owner}
        open={browserlessapiOpen}
        setOpen={setBrowserlessapiOpen}
        enabled={!!configs["browserlessapi"]}
        config={configs["browserlessapi"] ?? null}
      />

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
                <div>
                  <Button
                    variant={
                      configs[provider.providerId] ? "tertiary" : "secondary"
                    }
                    disabled={!provider.built}
                    onClick={() => {
                      switch (provider.providerId) {
                        case "openai":
                          setOpenAIOpen(true);
                          break;
                        case "mistral":
                          setMistralAiOpen(true);
                          break;
                        case "azure_openai":
                          setAzureOpenAIOpen(true);
                          break;
                        case "anthropic":
                          setAnthropicOpen(true);
                          break;
                        case "google_ai_studio":
                          setGoogleAiStudioOpen(true);
                          break;
                      }
                    }}
                    label={
                      configs[provider.providerId]
                        ? "Edit"
                        : provider.built
                          ? "Set up"
                          : "Coming Soon"
                    }
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Page.SectionHeader
          title="Service Providers"
          description="Service providers enable your Dust Apps to query external data or write to&nbsp;external&nbsp;services."
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
                  <Button
                    disabled={!provider.built}
                    variant={
                      configs[provider.providerId] ? "tertiary" : "secondary"
                    }
                    onClick={() => {
                      switch (provider.providerId) {
                        case "serpapi":
                          setSerpapiOpen(true);
                          break;
                        case "serper":
                          setSerperOpen(true);
                          break;
                        case "browserlessapi":
                          setBrowserlessapiOpen(true);
                          break;
                      }
                    }}
                    label={
                      configs[provider.providerId]
                        ? "Edit"
                        : provider.built
                          ? "Set up"
                          : "Coming Soon"
                    }
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </>
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
