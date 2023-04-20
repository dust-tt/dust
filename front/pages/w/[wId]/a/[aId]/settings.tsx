import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useEffect } from "react";

import MainTab from "@app/components/app/MainTab";
import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { AppType, AppVisibility } from "@app/types/app";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  app: AppType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
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
      redirect: {
        destination: `/w/${owner.sId}/a/${context.query.aId}`,
        permanent: false,
      },
    };
  }

  const app = await getApp(auth, context.params?.aId as string);

  if (!app) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      app,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function SettingsView({
  user,
  owner,
  app,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);

  const [appName, setAppName] = useState(app.name);
  const [appNameError, setAppNameError] = useState("");

  const [appDescription, setAppDescription] = useState(app.description || "");
  const [appVisibility, setAppVisibility] = useState(app.visibility);

  const formValidation = () => {
    if (appName.length == 0) {
      setAppNameError("");
      return false;
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

  const router = useRouter();

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this app?")) {
      let res = await fetch(`/api/w/${owner.sId}/apps/${app.sId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push(`/w/${owner.sId}/`);
      }
      return true;
    } else {
      return false;
    }
  };

  useEffect(() => {
    setDisabled(!formValidation());
  }, [appName]);

  return (
    <AppLayout user={user} owner={owner} app={app} gaTrackingId={gaTrackingId}>
      <div className="leadingflex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab app={app} currentTab="Settings" owner={owner} />
        </div>

        <div className="mx-auto mt-4 flex w-full max-w-5xl flex-auto">
          <div className="flex flex-1">
            <div className="w-full max-w-5xl px-4 sm:px-6 lg:px-8">
              <form
                action={`/api/w/${owner.sId}/apps/${app.sId}`}
                method="POST"
                className="mt-8 space-y-8 divide-y divide-gray-200"
              >
                <div className="space-y-8 divide-y divide-gray-200">
                  <div>
                    <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
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
                              "block w-full min-w-0 flex-1 rounded-none rounded-r-md text-sm",
                              appNameError
                                ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                                : "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
                            )}
                            value={appName}
                            onChange={(e) => setAppName(e.target.value)}
                          />
                        </div>
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
                            className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-violet-500 focus:ring-violet-500"
                            value={appDescription}
                            onChange={(e) => setAppDescription(e.target.value)}
                          />
                        </div>
                        <p className="mt-2 text-sm text-gray-500">
                          A good description will help others discover and
                          understand the purpose of your app. It is also visible
                          at the top of your app specification.
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
                                className="h-4 w-4 cursor-pointer border-gray-300 text-violet-600 focus:ring-violet-500"
                                value="public"
                                checked={appVisibility == "public"}
                                onChange={(e) => {
                                  if (e.target.value != appVisibility) {
                                    setAppVisibility(
                                      e.target.value as AppVisibility
                                    );
                                  }
                                }}
                              />
                              <label
                                htmlFor="appVisibilityPublic"
                                className="ml-3 block text-sm font-medium text-gray-700"
                              >
                                Public
                                <p className="mt-0 text-sm font-normal text-gray-500">
                                  Anyone on the Internet can see the app. Only
                                  you can edit.
                                </p>
                              </label>
                            </div>
                            <div className="flex items-center">
                              <input
                                id="appVisibilityPrivate"
                                name="visibility"
                                type="radio"
                                value="private"
                                className="h-4 w-4 cursor-pointer border-gray-300 text-violet-600 focus:ring-violet-500"
                                checked={appVisibility == "private"}
                                onChange={(e) => {
                                  if (e.target.value != appVisibility) {
                                    setAppVisibility(
                                      e.target.value as AppVisibility
                                    );
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
                                className="h-4 w-4 cursor-pointer border-gray-300 text-violet-600 focus:ring-violet-500"
                                checked={appVisibility == "unlisted"}
                                onChange={(e) => {
                                  if (e.target.value != appVisibility) {
                                    setAppVisibility(
                                      e.target.value as AppVisibility
                                    );
                                  }
                                }}
                              />
                              <label
                                htmlFor="app-visibility-unlisted"
                                className="ml-3 block text-sm font-medium text-gray-700"
                              >
                                Unlisted
                                <p className="mt-0 text-sm font-normal text-gray-500">
                                  Anyone with the link can see the app. Only you
                                  can edit.
                                </p>
                              </label>
                            </div>
                          </div>
                          {appVisibility == "deleted" ? (
                            <p className="mt-4 text-sm font-normal text-gray-500">
                              This app is currently marked as deleted. Change
                              its visibility above to restore it.
                            </p>
                          ) : null}
                        </fieldset>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex pt-6">
                  <Button disabled={disable} type="submit">
                    Update
                  </Button>
                  <div className="flex-1"></div>
                  <div className="flex">
                    <Link href={`/w/${owner.sId}/a/${app.sId}/clone`}>
                      <Button>Clone</Button>
                    </Link>
                  </div>
                  <div className="ml-2 flex">
                    <Button onClick={handleDelete}>Delete</Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
