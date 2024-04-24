import {
  Button,
  CommandLineIcon,
  LockIcon,
  Page,
  PlusIcon,
  ShapesIcon,
  Tab,
} from "@dust-tt/sparkle";
import type { KeyType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import { A } from "@app/components/home/contentComponents";
import AI21Setup from "@app/components/providers/AI21Setup";
import AnthropicSetup from "@app/components/providers/AnthropicSetup";
import AzureOpenAISetup from "@app/components/providers/AzureOpenAISetup";
import BrowserlessAPISetup from "@app/components/providers/BrowserlessAPISetup";
import CohereSetup from "@app/components/providers/CohereSetup";
import GoogleAiStudioSetup from "@app/components/providers/GoogleAiStudioSetup";
import MistralAISetup from "@app/components/providers/MistralAISetup";
import OpenAISetup from "@app/components/providers/OpenAISetup";
import SerpAPISetup from "@app/components/providers/SerpAPISetup";
import SerperSetup from "@app/components/providers/SerperSetup";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { getApps } from "@app/lib/api/app";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { modelProviders, serviceProviders } from "@app/lib/providers";
import { useKeys, useProviders } from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  apps: AppType[];
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const apps = await getApps(auth);

  return {
    props: {
      owner,
      subscription,
      apps,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export function APIKeys({ owner }: { owner: WorkspaceType }) {
  const { mutate } = useSWRConfig();

  const { keys } = useKeys(owner);
  const [isRevealed, setIsRevealed] = useState(
    {} as { [key: string]: boolean }
  );

  const { submit: handleGenerate, isSubmitting: isGenerating } =
    useSubmitFunction(async () => {
      await fetch(`/api/w/${owner.sId}/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      // const data = await res.json();
      await mutate(`/api/w/${owner.sId}/keys`);
      // scroll to bottom
      const mainTag = document.querySelector("main");
      if (mainTag) {
        mainTag.scrollTo({
          top: mainTag.scrollHeight,
          behavior: "smooth",
        });
      }
    });

  const { submit: handleRevoke, isSubmitting: isRevoking } = useSubmitFunction(
    async (key: KeyType) => {
      await fetch(`/api/w/${owner.sId}/keys/${key.secret}/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      // const data = await res.json();
      await mutate(`/api/w/${owner.sId}/keys`);
    }
  );

  return (
    <>
      <Page.SectionHeader
        title="Secret API Keys"
        description="Secrets used to communicate between your servers and Dust. Do not share them with anyone. Do not use them in client-side or browser code."
        action={{
          label: "Create Secret API Key",
          variant: "primary",
          onClick: async () => {
            await handleGenerate();
          },
          icon: PlusIcon,
          disabled: isGenerating || isRevoking,
        }}
      />
      <div className="space-y-4 divide-y divide-gray-200">
        <ul role="list" className="pt-4">
          {keys
            .sort((a, b) => (b.status === "active" ? 1 : -1))
            .map((key) => (
              <li key={key.secret} className="px-2 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex flex-col">
                      <div className="flex flex-row">
                        <p
                          className={classNames(
                            "font-mono truncate text-sm text-slate-700"
                          )}
                        >
                          {isRevealed[key.secret] ? (
                            <>
                              {key.secret}
                              {key.status == "active" ? (
                                <EyeSlashIcon
                                  className="ml-2 inline h-4 w-4 cursor-pointer text-gray-400"
                                  onClick={() => {
                                    setIsRevealed({
                                      ...isRevealed,
                                      [key.secret]: false,
                                    });
                                  }}
                                />
                              ) : null}
                            </>
                          ) : (
                            <>
                              sk-...{key.secret.slice(-5)}
                              {key.status == "active" ? (
                                <EyeIcon
                                  className="ml-2 inline h-4 w-4 cursor-pointer text-gray-400"
                                  onClick={() => {
                                    setIsRevealed({
                                      ...isRevealed,
                                      [key.secret]: true,
                                    });
                                  }}
                                />
                              ) : null}
                            </>
                          )}
                        </p>
                        <div className="ml-2 mt-0.5 flex flex-shrink-0">
                          <p
                            className={classNames(
                              "mb-0.5 inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                              key.status === "active"
                                ? "bg-green-100 text-green-800"
                                : "ml-6 bg-gray-100 text-gray-800"
                            )}
                          >
                            {key.status === "active" ? "active" : "revoked"}
                          </p>
                        </div>
                      </div>
                      <p className="front-normal text-xs text-element-700">
                        Created {key.creator ? `by ${key.creator} ` : ""}
                        {timeAgoFrom(key.createdAt, {
                          useLongFormat: true,
                        })}{" "}
                        ago.
                      </p>
                    </div>
                  </div>
                  {key.status === "active" ? (
                    <div>
                      <Button
                        variant="secondaryWarning"
                        disabled={
                          key.status != "active" || isRevoking || isGenerating
                        }
                        onClick={async () => {
                          await handleRevoke(key);
                        }}
                        label="Revoke"
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}

export function Providers({ owner }: { owner: WorkspaceType }) {
  const [openAIOpen, setOpenAIOpen] = useState(false);
  const [cohereOpen, setCohereOpen] = useState(false);
  const [ai21Open, setAI21Open] = useState(false);
  const [azureOpenAIOpen, setAzureOpenAIOpen] = useState(false);
  const [anthropicOpen, setAnthropicOpen] = useState(false);
  const [mistalAIOpen, setMistralAiOpen] = useState(false);
  const [googleAiStudioOpen, setGoogleAiStudioOpen] = useState(false);
  const [serpapiOpen, setSerpapiOpen] = useState(false);
  const [serperOpen, setSerperOpen] = useState(false);
  const [browserlessapiOpen, setBrowserlessapiOpen] = useState(false);

  const { providers, isProvidersLoading, isProvidersError } =
    useProviders(owner);

  const configs = {} as any;

  if (!isProvidersLoading && !isProvidersError) {
    for (let i = 0; i < providers.length; i++) {
      // Extract API key and hide it from the config object to be displayed.
      // Store the original API key in a separate property for display use.
      const { api_key, ...rest } = JSON.parse(providers[i].config);
      configs[providers[i].providerId] = {
        ...rest,
        api_key: "",
        redacted_api_key: api_key,
      };
    }
  }

  return (
    <>
      <OpenAISetup
        owner={owner}
        open={openAIOpen}
        setOpen={setOpenAIOpen}
        enabled={!!configs["openai"]}
        config={configs["openai"] ?? null}
      />
      <CohereSetup
        owner={owner}
        open={cohereOpen}
        setOpen={setCohereOpen}
        enabled={!!configs["cohere"]}
        config={configs["cohere"] ?? null}
      />
      <AI21Setup
        owner={owner}
        open={ai21Open}
        setOpen={setAI21Open}
        enabled={!!configs["ai21"]}
        config={configs["ai21"] ?? null}
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
          description="Model providers available to your apps. These providers are not required to run our assistant apps, only your own custom large language model apps."
        />
        <ul role="list" className="pt-4">
          {modelProviders.map((provider) => (
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
                      <span className="rounded bg-gray-300 px-1">
                        ...
                        {configs[
                          provider.providerId
                        ].redacted_api_key.substring(
                          configs[provider.providerId].redacted_api_key.length -
                            6
                        )}
                      </span>
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
                        case "cohere":
                          setCohereOpen(true);
                          break;
                        case "ai21":
                          setAI21Open(true);
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
          description="Service providers enable your apps to query external data or write to&nbsp;external&nbsp;services."
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

function Apps({ apps, owner }: { apps: AppType[]; owner: WorkspaceType }) {
  const router = useRouter();
  return (
    <Page.Vertical align="stretch">
      <Page.SectionHeader
        title="Dust Apps"
        description="Create and manage your custom Large Language Models apps."
        action={{
          label: "Create App",
          variant: "primary",
          onClick: async () => {
            void router.push(`/w/${owner.sId}/a/new`);
          },
          icon: PlusIcon,
        }}
      />
      <ul role="list" className="pt-4">
        {apps.map((app) => (
          <li key={app.sId} className="px-2">
            <div className="py-4">
              <div className="flex items-center justify-between">
                <Link href={`/w/${owner.sId}/a/${app.sId}`} className="block">
                  <p className="truncate text-base font-bold text-action-600">
                    {app.name}
                  </p>
                </Link>
                <div className="ml-2 flex flex-shrink-0">
                  <p
                    className={classNames(
                      "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                      app.visibility == "public"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    )}
                  >
                    {app.visibility}
                  </p>
                </div>
              </div>
              <div className="mt-2 sm:flex sm:justify-between">
                <div className="sm:flex">
                  <p className="flex items-center text-sm text-gray-700">
                    {app.description}
                  </p>
                </div>
                <div className="mt-2 flex items-center text-sm text-gray-300 sm:mt-0">
                  <p>{app.sId}</p>
                </div>
              </div>
            </div>
          </li>
        ))}
        {apps.length == 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center text-sm text-gray-500">
            <p>Welcome to the Dust developer platform 🔥</p>
            <p className="mt-2">
              Setup your Providers (below) or create your first app to get
              started.
            </p>
            <p className="mt-6">
              You can also visit our developer documentation:
            </p>
            <p className="mt-2">
              <Link href="https://docs.dust.tt" target="_blank">
                <Button variant="tertiary" label="View Documentation" />
              </Link>
            </p>
          </div>
        ) : null}
      </ul>
    </Page.Vertical>
  );
}

export default function Developers({
  owner,
  subscription,
  apps,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [currentTab, setCurrentTab] = useState("apps");
  const router = useRouter();
  const handleTabChange = async (tabId: string) => {
    const query = { ...router.query, t: tabId };
    await router.push({ query });
  };

  useEffect(() => {
    if (router.query.t) {
      setCurrentTab(router.query.t as string);
    }
  }, [router.query]);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
        owner,
        current: "developers",
      })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Developers Tools"
          icon={CommandLineIcon}
          description="Design and deploy custom large language model apps with access to&nbsp;your data&nbsp;sources and other&nbsp;service&nbsp;providers."
        />
        <Page.P variant="secondary">
          You can access Dust's services{" "}
          <A>
            <Link href="https://docs.dust.tt">through our API.</Link>
          </A>{" "}
          Our code is open source and available on{" "}
          <A>
            <Link href="https://github.com/dust-tt">GitHub.</Link>
          </A>
        </Page.P>

        <Tab
          tabs={[
            {
              label: "My Apps",
              id: "apps",
              current: currentTab === "apps",
              icon: CommandLineIcon,
              sizing: "expand",
            },
            {
              label: "Providers",
              id: "providers",
              current: currentTab === "providers",
              icon: ShapesIcon,
              sizing: "expand",
            },
            {
              label: "API Keys",
              id: "apikeys",
              current: currentTab === "apikeys",
              icon: LockIcon,
              sizing: "expand",
            },
          ]}
          setCurrentTab={async (tabId, event) => {
            event.preventDefault();
            await handleTabChange(tabId);
          }}
        />

        {(() => {
          switch (currentTab) {
            case "apps":
              return <Apps apps={apps} owner={owner} />;
            case "providers":
              return <Providers owner={owner} />;
            case "apikeys":
              return <APIKeys owner={owner} />;
            default:
              return null;
          }
        })()}
      </Page.Vertical>
    </AppLayout>
  );
}
