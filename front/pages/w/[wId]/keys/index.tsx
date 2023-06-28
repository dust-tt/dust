import { PlusIcon } from "@heroicons/react/20/solid";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";
import { mutate } from "swr";

import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/profile/MainTab";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useKeys } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { KeyType } from "@app/types/key";
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

  if (!auth.isBuilder()) {
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

export default function ProfileKeys({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
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
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="API Keys" owner={owner} />
        </div>

        <div className="">
          <div className="mx-auto max-w-4xl space-y-4 divide-y divide-gray-200 px-6">
            <div className="mt-8 flex flex-col justify-between md:flex-row md:items-center">
              <div className="">
                <h1 className="text-base font-medium text-gray-900">
                  Secret API Keys
                </h1>

                <p className="text-sm text-gray-500">
                  Secrets used to communicate between your servers and Dust. Do
                  not share them with anyone. Do not use them in client-side or
                  browser code.
                </p>
              </div>
              <div className="mr-2 mt-2 whitespace-nowrap  md:ml-12">
                <Button
                  onClick={async () => {
                    await handleGenerate();
                  }}
                >
                  <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                  Create Secret API Key
                </Button>
              </div>
            </div>
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
                          disabled={key.status != "active"}
                          onClick={async () => {
                            await handleRevoke(key);
                          }}
                        >
                          Revoke
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
