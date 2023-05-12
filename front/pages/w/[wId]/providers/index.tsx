import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";

import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/profile/MainTab";
import AI21Setup from "@app/components/providers/AI21Setup";
import AnthropicSetup from "@app/components/providers/AnthropicSetup";
import AzureOpenAISetup from "@app/components/providers/AzureOpenAISetup";
import BrowserlessAPISetup from "@app/components/providers/BrowserlessAPISetup";
import CohereSetup from "@app/components/providers/CohereSetup";
import OpenAISetup from "@app/components/providers/OpenAISetup";
import SerpAPISetup from "@app/components/providers/SerpAPISetup";
import SerperSetup from "@app/components/providers/SerperSetup";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { modelProviders, serviceProviders } from "@app/lib/providers";
import { useProviders } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);

  const user = await getUserFromSession(session);
  if (!user) {
    return {
      notFound: true,
    };
  }

  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  if (!auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function ProfileProviders({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [openAIOpen, setOpenAIOpen] = useState(false);
  const [cohereOpen, setCohereOpen] = useState(false);
  const [ai21Open, setAI21Open] = useState(false);
  const [azureOpenAIOpen, setAzureOpenAIOpen] = useState(false);
  const [anthropicOpen, setAnthropicOpen] = useState(false);
  const [serpapiOpen, setSerpapiOpen] = useState(false);
  const [serperOpen, setSerperOpen] = useState(false);
  const [browserlessapiOpen, setBrowserlessapiOpen] = useState(false);

  const { providers, isProvidersLoading, isProvidersError } = useProviders(owner);

  const configs = {} as any;

  if (!isProvidersLoading && !isProvidersError) {
    for (let i = 0; i < providers.length; i++) {
      configs[providers[i].providerId] = JSON.parse(providers[i].config);
    }
  }

  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Providers" owner={owner} />
        </div>

        <OpenAISetup
          owner={owner}
          open={openAIOpen}
          setOpen={setOpenAIOpen}
          enabled={configs["openai"] ? true : false}
          config={configs["openai"] ? configs["openai"] : null}
        />
        <CohereSetup
          owner={owner}
          open={cohereOpen}
          setOpen={setCohereOpen}
          enabled={configs["cohere"] ? true : false}
          config={configs["cohere"] ? configs["cohere"] : null}
        />
        <AI21Setup
          owner={owner}
          open={ai21Open}
          setOpen={setAI21Open}
          enabled={configs["ai21"] ? true : false}
          config={configs["ai21"] ? configs["ai21"] : null}
        />
        <AzureOpenAISetup
          owner={owner}
          open={azureOpenAIOpen}
          setOpen={setAzureOpenAIOpen}
          enabled={configs["azure_openai"] ? true : false}
          config={configs["azure_openai"] ? configs["azure_openai"] : null}
        />
        <AnthropicSetup
          owner={owner}
          open={anthropicOpen}
          setOpen={setAnthropicOpen}
          enabled={configs["anthropic"] ? true : false}
          config={configs["anthropic"] ? configs["anthropic"] : null}
        />
        <SerpAPISetup
          owner={owner}
          open={serpapiOpen}
          setOpen={setSerpapiOpen}
          enabled={configs["serpapi"] ? true : false}
          config={configs["serpapi"] ? configs["serpapi"] : null}
        />
        <SerperSetup
          owner={owner}
          open={serperOpen}
          setOpen={setSerperOpen}
          enabled={configs["serper"] ? true : false}
          config={configs["serper"] ? configs["serper"] : null}
        />
        <BrowserlessAPISetup
          owner={owner}
          open={browserlessapiOpen}
          setOpen={setBrowserlessapiOpen}
          enabled={configs["browserlessapi"] ? true : false}
          config={configs["browserlessapi"] ? configs["browserlessapi"] : null}
        />

        <div className="">
          <div className="mx-auto space-y-4 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
            <div className="sm:flex sm:items-center">
              <div className="mt-8 sm:flex-auto">
                <h1 className="text-base font-medium text-gray-900">
                  Model Providers
                </h1>

                <p className="text-sm text-gray-500">
                  Model providers available to your apps. Activate at least one
                  to be able to run your apps.
                </p>
              </div>
            </div>

            <ul role="list" className="">
              {modelProviders.map((provider) => (
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
                          {configs[provider.providerId]
                            ? "enabled"
                            : "disabled"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Button
                        disabled={!provider.built}
                        onClick={() => {
                          switch (provider.providerId) {
                            case "openai":
                              setOpenAIOpen(true);
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
                          }
                        }}
                      >
                        {configs[provider.providerId]
                          ? "Edit"
                          : provider.built
                          ? "Setup"
                          : "Coming Soon"}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto space-y-4 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
            <div className="sm:flex sm:items-center">
              <div className="mt-8 sm:flex-auto">
                <h1 className="text-base font-medium text-gray-900">
                  Service Providers
                </h1>

                <p className="text-sm text-gray-500">
                  Service providers enable your apps to query external data or
                  write to external services.
                </p>
              </div>
            </div>

            <ul role="list" className="">
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
                          {configs[provider.providerId]
                            ? "enabled"
                            : "disabled"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Button
                        disabled={!provider.built}
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
                      >
                        {configs[provider.providerId]
                          ? "Edit"
                          : provider.built
                          ? "Setup"
                          : "Coming Soon"}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
