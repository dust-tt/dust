import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/profile/MainTab";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { useSession } from "next-auth/react";
import { classNames } from "@app/lib/utils";
import { Button } from "@app/components/Button";
import { useState } from "react";
import { useKeys } from "@app/lib/swr";
import { mutate } from "swr";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function KeysProviders({ ga_tracking_id }) {
  const { data: session } = useSession();

  let { keys, isKeysLoading, isKeysError } = useKeys();
  let [isRevealed, setIsRevealed] = useState({});

  const handleGenerate = async () => {
    const res = await fetch(`/api/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    mutate(`/api/keys`);
  };

  const handleDisable = async (key) => {
    const res = await fetch(`/api/keys/${key.secret}/disable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    mutate(`/api/keys`);
  };

  return (
    <AppLayout ga_tracking_id={ga_tracking_id}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="API keys" />
        </div>

        <div className="">
          <div className="mx-auto space-y-4 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
            <div className="sm:flex sm:items-center">
              <div className="mt-8 sm:flex-auto">
                <h1 className="text-base font-medium text-gray-900">
                  API keys
                </h1>

                <p className="text-sm text-gray-500">
                  Your secret API keys are listed below. They are used to expose
                  Dust apps as endpoints. When running an app through an
                  endpoint with your API key, the providers associated with your
                  account will be used to run the app. Do not share your API
                  keys with others, or expose it in the browser or client-side
                  code.
                </p>
                <div className="mt-4 mb-2 sm:flex sm:items-center">
                  <Button
                    onClick={() => {
                      handleGenerate();
                    }}
                  >
                    Create new secret key
                  </Button>
                </div>
              </div>
            </div>

            <ul role="list" className="">
              {keys.map((key) => (
                <li key={key.secret} className="px-2 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <p
                        className={classNames(
                          "truncate font-mono text-sm text-slate-700"
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
                          {key.status}
                        </p>
                      </div>
                    </div>
                    {key.status === "active" ? (
                      <div>
                        <Button
                          disabled={key.status != "active"}
                          onClick={() => {
                            handleDisable(key);
                          }}
                        >
                          Disable
                        </Button>
                      </div>
                    ) : null}
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
