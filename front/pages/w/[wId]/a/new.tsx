import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

import { Button } from "@app/components/Button";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { APIError } from "@app/lib/error";
import { classNames, MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";
import { AppType } from "@app/types/app";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isBuilder()) {
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

export default function NewApp({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);

  const [appName, setAppName] = useState("");
  const [appNameError, setAppNameError] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [appVisibility, setAppVisibility] = useState("public");

  const [creating, setCreating] = useState(false);

  const formValidation = () => {
    if (appName.length == 0) {
      setAppNameError("");
      return false;
      // eslint-disable-next-line no-useless-escape
    } else if (!appName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setAppNameError(
        "App name must only contain letters, numbers, and the characters `._-`"
      );
      return false;
    } else {
      setAppNameError("");
      return true;
    }
  };

  useEffect(() => {
    setDisabled(!formValidation());
  }, [appName]);

  const router = useRouter();

  const handleCreate = async () => {
    setCreating(true);
    const res = await fetch(`/api/w/${owner.sId}/apps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: appName.slice(0, MODELS_STRING_MAX_LENGTH),
        description: appDescription.slice(0, MODELS_STRING_MAX_LENGTH),
        visibility: appVisibility,
      }),
    });
    if (res.ok) {
      const appRes = (await res.json()) as { app: AppType };
      await router.push(`/w/${owner.sId}/a/${appRes.app.sId}`);
    } else {
      const err = (await res.json()) as { error: APIError };
      setCreating(false);
      window.alert(`Error creating app: ${err.error.message}`);
    }
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "developers" })}
    >
      <div className="flex flex-col">
        <div className="mt-8 space-y-8 divide-y divide-gray-200">
          <div className="space-y-4 divide-y divide-gray-200">
            <div>
              <h3 className="text-base font-medium leading-6 text-gray-900">
                Create a new App
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                An app consists of its specification (defining chained
                interactions with models and external services), datasets to run
                the app or few-shot prompt models. Everything is automatically
                versioned and stored.
              </p>
            </div>
            <div>
              <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label
                    htmlFor="appName"
                    className="block text-sm font-medium text-gray-700"
                  >
                    App Name
                  </label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 pl-3 pr-1 text-sm text-gray-500">
                      {owner.name}
                      <ChevronRightIcon
                        className="h-5 w-5 flex-shrink-0 pt-0.5 text-gray-400"
                        aria-hidden="true"
                      />
                    </span>
                    <input
                      type="text"
                      name="name"
                      id="appName"
                      className={classNames(
                        "block w-full min-w-0 flex-1 rounded-none rounded-r-md border border-gray-300 bg-structure-50 p-1 text-sm",
                        appNameError
                          ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-action-500 focus:ring-action-500"
                      )}
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Think GitHub repository names, short and memorable.
                  </p>
                </div>

                <div className="sm:col-span-6">
                  <div className="flex justify-between">
                    <label
                      htmlFor="appDescription"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Description
                    </label>
                    <div className="text-sm font-normal text-gray-400">
                      optional
                    </div>
                  </div>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <input
                      type="text"
                      name="description"
                      id="appDescription"
                      className="block w-full min-w-0 flex-1 rounded-md border border-gray-300 bg-structure-50 p-1 text-sm focus:border-action-500 focus:ring-action-500"
                      value={appDescription}
                      onChange={(e) => setAppDescription(e.target.value)}
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    A good description will help others discover and understand
                    the purpose of your app. It is also visible at the top of
                    your app specification.
                  </p>
                </div>

                <div className="sm:col-span-6">
                  <fieldset className="mt-2">
                    <legend className="contents text-sm font-medium text-gray-700">
                      Visibility
                    </legend>
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center">
                        <input
                          id="appVisibilityPublic"
                          name="visibility"
                          type="radio"
                          className="h-4 w-4 cursor-pointer border-gray-300 text-action-600 focus:ring-action-500"
                          value="public"
                          checked={appVisibility == "public"}
                          onChange={(e) => {
                            if (e.target.value != appVisibility) {
                              setAppVisibility(e.target.value);
                            }
                          }}
                        />
                        <label
                          htmlFor="appVisibilityPublic"
                          className="ml-3 block text-sm font-medium text-gray-700"
                        >
                          Public
                          <p className="mt-0 text-sm font-normal text-gray-500">
                            Anyone on the Internet can see the app. Only you can
                            edit.
                          </p>
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          id="appVisibilityPrivate"
                          name="visibility"
                          type="radio"
                          value="private"
                          className="h-4 w-4 cursor-pointer border-gray-300 text-action-600 focus:ring-action-500"
                          checked={appVisibility == "private"}
                          onChange={(e) => {
                            if (e.target.value != appVisibility) {
                              setAppVisibility(e.target.value);
                            }
                          }}
                        />
                        <label
                          htmlFor="appVisibilityPrivate"
                          className="ml-3 block text-sm font-medium text-gray-700"
                        >
                          Private
                          <p className="mt-0 text-sm font-normal text-gray-500">
                            Only you can see and edit the app.
                          </p>
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          id="appVisibilityUnlisted"
                          name="visibility"
                          type="radio"
                          value="unlisted"
                          className="h-4 w-4 cursor-pointer border-gray-300 text-action-600 focus:ring-action-500"
                          checked={appVisibility == "unlisted"}
                          onChange={(e) => {
                            if (e.target.value != appVisibility) {
                              setAppVisibility(e.target.value);
                            }
                          }}
                        />
                        <label
                          htmlFor="app-visibility-unlisted"
                          className="ml-3 block text-sm font-medium text-gray-700"
                        >
                          Unlisted
                          <p className="mt-0 text-sm font-normal text-gray-500">
                            Anyone with the link can see the app. Only you can
                            edit.
                          </p>
                        </label>
                      </div>
                    </div>
                  </fieldset>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <div className="flex">
              <Button onClick={handleCreate} disabled={disable || creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
