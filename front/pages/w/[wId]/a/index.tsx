import {
  Button,
  CommandLineIcon,
  PageHeader,
  PlusIcon,
  SectionHeader,
} from "@dust-tt/sparkle";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { mutate } from "swr";

import AI21Setup from "@app/components/providers/AI21Setup";
import AnthropicSetup from "@app/components/providers/AnthropicSetup";
import AzureOpenAISetup from "@app/components/providers/AzureOpenAISetup";
import BrowserlessAPISetup from "@app/components/providers/BrowserlessAPISetup";
import CohereSetup from "@app/components/providers/CohereSetup";
import OpenAISetup from "@app/components/providers/OpenAISetup";
import SerpAPISetup from "@app/components/providers/SerpAPISetup";
import SerperSetup from "@app/components/providers/SerperSetup";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getApps } from "@app/lib/api/app";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { modelProviders, serviceProviders } from "@app/lib/providers";
import { useKeys, useProviders } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { AppType } from "@app/types/app";
import { KeyType } from "@app/types/key";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  apps: AppType[];
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
  if (!owner || !user) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const apps = await getApps(auth);

  return {
    props: {
      user,
      owner,
      readOnly,
      apps,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export function APIKeys({ owner }: { owner: WorkspaceType }) {
  const { keys } = useKeys(owner);
  const [isRevealed, setIsRevealed] = useState(
    {} as { [key: string]: boolean }
  );

  const handleGenerate = async () => {
    await fetch(`/api/w/${owner.sId}/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    // const data = await res.json();
    await mutate(`/api/w/${owner.sId}/keys`);
  };

  const handleRevoke = async (key: KeyType) => {
    await fetch(`/api/w/${owner.sId}/keys/${key.secret}/disable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    // const data = await res.json();
    await mutate(`/api/w/${owner.sId}/keys`);
  };

  return (
    <>
      <SectionHeader
        title="Secret API Keys"
        description="Secrets used to communicate between your servers and Dust. Do not share them with anyone. Do not use them in client-side or browser code."
        action={{
          label: "Create Secret API Key",
          variant: "tertiary",
          onClick: async () => {
            await handleGenerate();
          },
          icon: PlusIcon,
        }}
      />
      <div className="space-y-4 divide-y divide-gray-200">
        <ul role="list" className="pt-4">
          {keys.map((key) => (
            <li key={key.secret} className="px-2 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
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
                {key.status === "active" ? (
                  <div>
                    <Button
                      variant="secondaryWarning"
                      disabled={key.status != "active"}
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
  const [serpapiOpen, setSerpapiOpen] = useState(false);
  const [serperOpen, setSerperOpen] = useState(false);
  const [browserlessapiOpen, setBrowserlessapiOpen] = useState(false);

  const { providers, isProvidersLoading, isProvidersError } =
    useProviders(owner);

  const configs = {} as any;

  if (!isProvidersLoading && !isProvidersError) {
    for (let i = 0; i < providers.length; i++) {
      configs[providers[i].providerId] = JSON.parse(providers[i].config);
    }
  }

  return (
    <>
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

      <>
        <SectionHeader
          title="Model Providers"
          description="Model providers available to your apps. These providers are not required to run our assistant apps, only your own custom large language model apps."
        />
        <ul role="list" className="pt-4">
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
                      {configs[provider.providerId] ? "enabled" : "disabled"}
                    </p>
                  </div>
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

        <SectionHeader
          title="Service Providers"
          description="Service providers enable your apps to query external data or write to external services."
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

export default function Developers({
  user,
  owner,
  readOnly,
  apps,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "developers" })}
    >
      <PageHeader
        title="Developers Tools"
        icon={CommandLineIcon}
        description="Design and deploy custom large language model apps with access to your Data Sources and other Service Providers."
      />
      <div className="flex flex-col">
        <SectionHeader
          title="Apps"
          description="Your Large Language Model apps."
          action={{
            label: "Create App",
            variant: "tertiary",
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
              {readOnly ? (
                <>
                  <p>
                    Welcome to Dust 🔥 This user has not created any app yet 🙃
                  </p>
                  <p className="mt-2">Sign-in to create your own apps.</p>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          ) : null}
        </ul>
        {!readOnly ? <Providers owner={owner} /> : null}
        {!readOnly ? <APIKeys owner={owner} /> : null}
      </div>
    </AppLayout>
  );
}
