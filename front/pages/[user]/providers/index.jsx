import AppLayout from "../../../components/app/AppLayout";
import MainTab from "../../../components/profile/MainTab";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { classNames } from "../../../lib/utils";
import { Button } from "../../../components/Button";
import OpenAIProviderSetup from "../../../components/app/providers/OpenAIProviderSetup";
import { useState } from "react";

const { URL } = process.env;

export default function ProfileProviders() {
  const { data: session } = useSession();

  const [openAIOpen, setOpenAIOpen] = useState(false);

  const modelProviders = [
    {
      providerId: "openai",
      name: "OpenAI",
      built: true,
      setter: setOpenAIOpen,
    },
    { providerId: "cohere", name: "Cohere", built: false },
    { providerId: "hugging_face", name: "HuggingFace", built: false },
    { providerId: "replicate", name: "Replicate", built: false },
  ];

  const serviceProviders = [
    { providerId: "google_search", name: "Google Search", built: false },
    { providerId: "bing_search", name: "Bing Search", built: false },
    { providerId: "youtube", name: "Youtube Search", built: false },
    { providerId: "notion", name: "Notion", built: false },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab current_tab="Providers" />
        </div>

        <OpenAIProviderSetup open={openAIOpen} setter={setOpenAIOpen}/>

        <div className="">
          <div className="mx-auto max-w-4xl px-6 divide-y divide-gray-200 space-y-4">
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
                      <p className="truncate text-base font-bold text-violet-600">
                        {provider.name}
                      </p>
                      <div className="ml-2 flex flex-shrink-0 mt-0.5">
                        <p
                          className={classNames(
                            "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                            false
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          )}
                        >
                          disabled
                        </p>
                      </div>
                    </div>
                    <div>
                      <Button
                        disabled={!provider.built}
                        onClick={() => {
                          provider.setter(true);
                        }}
                      >
                        Setup
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto max-w-4xl px-6 divide-y divide-gray-200 space-y-4">
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
                      <p className="truncate text-base font-bold text-violet-600">
                        {provider.name}
                      </p>
                      <div className="ml-2 flex flex-shrink-0 mt-0.5">
                        <p
                          className={classNames(
                            "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                            false
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          )}
                        >
                          disabled
                        </p>
                      </div>
                    </div>
                    <div>
                      <Button disabled={!provider.built}>Setup</Button>
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
    props: { session },
  };
}
