import AppLayout from "../../../components/app/AppLayout";
import MainTab from "../../../components/profile/MainTab";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { useSession } from "next-auth/react";
import { classNames } from "../../../lib/utils";
import { Button } from "../../../components/Button";
import OpenAISetup from "../../../components/providers/OpenAISetup";
import CohereSetup from "../../../components/providers/CohereSetup";
import AI21Setup from "../../../components/providers/AI21Setup";
import SerpAPISetup from "../../../components/providers/SerpAPISetup";
import BrowserlessAPISetup from "../../../components/providers/BrowserlessAPISetup";

import { useState } from "react";
import { useProviders } from "../../../lib/swr";
import { modelProviders, serviceProviders } from "../../../lib/providers";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function ProfileProviders({ ga_tracking_id }) {
  const { data: session } = useSession();

  const [openAIOpen, setOpenAIOpen] = useState(false);
  const [cohereOpen, setCohereOpen] = useState(false);
  const [ai21Open, setAI21Open] = useState(false);
  const [serpapiOpen, setSerpapiOpen] = useState(false);
  const [browserlessapiOpen, setBrowserlessapiOpen] = useState(false);

  let { providers, isProvidersLoading, isProvidersError } = useProviders();

  let configs = {};

  if (!isProvidersLoading && !isProvidersError) {
    for (var i = 0; i < providers.length; i++) {
      configs[providers[i].providerId] = JSON.parse(providers[i].config);
    }
  }

  return (
    <AppLayout ga_tracking_id={ga_tracking_id}>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab current_tab="Providers" />
        </div>

        <OpenAISetup
          open={openAIOpen}
          setOpen={setOpenAIOpen}
          enabled={configs["openai"] ? true : false}
          config={configs["openai"] ? configs["openai"] : null}
        />
        <CohereSetup
          open={cohereOpen}
          setOpen={setCohereOpen}
          enabled={configs["cohere"] ? true : false}
          config={configs["cohere"] ? configs["cohere"] : null}
        />
        <AI21Setup
          open={ai21Open}
          setOpen={setAI21Open}
          enabled={configs["ai21"] ? true : false}
          config={configs["ai21"] ? configs["ai21"] : null}
        />
        <SerpAPISetup
          open={serpapiOpen}
          setOpen={setSerpapiOpen}
          enabled={configs["serpapi"] ? true : false}
          config={configs["serpapi"] ? configs["serpapi"] : null}
        />
        <BrowserlessAPISetup
          open={browserlessapiOpen}
          setOpen={setBrowserlessapiOpen}
          enabled={configs["browserlessapi"] ? true : false}
          config={configs["browserlessapi"] ? configs["browserlessapi"] : null}
        />

        <div className="">
          <div className="mx-auto sm:max-w-2xl lg:max-w-4xl px-6 divide-y divide-gray-200 space-y-4">
            <div className="sm:flex sm:items-center">
              <div className="sm:flex-auto mt-8">
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
                      <div className="ml-2 flex flex-shrink-0 mt-0.5">
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

          <div className="mx-auto sm:max-w-2xl lg:max-w-4xl px-6 divide-y divide-gray-200 space-y-4">
            <div className="sm:flex sm:items-center">
              <div className="sm:flex-auto mt-8">
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
                      <div className="ml-2 flex flex-shrink-0 mt-0.5">
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

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  if (!session) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (context.query.user != session.user.username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  return {
    props: { session, ga_tracking_id: GA_TRACKING_ID },
  };
}
