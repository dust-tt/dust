import { Button, Tab } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useState } from "react";
import { useEffect } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { subNavigationApp } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { classNames, MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";
import { dustAppsListUrl } from "@app/lib/vaults";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  app: AppType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  if (!auth.isBuilder()) {
    return {
      redirect: {
        destination: `/w/${owner.sId}/vaults/${context.query.vaultId}/apps/${context.query.aId}`,
        permanent: false,
      },
    };
  }

  const app = await AppResource.fetchById(auth, context.params?.aId as string);

  if (!app) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      app: app.toJSON(),
    },
  };
});

export default function SettingsView({
  owner,
  subscription,
  app,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);

  const [appName, setAppName] = useState(app.name);
  const [appNameError, setAppNameError] = useState("");

  const [appDescription, setAppDescription] = useState(app.description || "");

  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const confirm = useContext(ConfirmContext);

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

  const router = useRouter();

  const handleDelete = async () => {
    if (
      await confirm({
        title: "Double checking",
        message: "Are you sure you want to delete this app?",
        validateVariant: "primaryWarning",
      })
    ) {
      setIsDeleting(true);
      const res = await fetch(
        `/api/w/${owner.sId}/vaults/${app.vault.sId}/apps/${app.sId}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        await router.push(dustAppsListUrl(owner, app.vault));
      } else {
        setIsDeleting(false);
        const err = (await res.json()) as { error: APIError };
        window.alert(
          `Failed to delete the app (contact support@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
        );
      }
      return true;
    } else {
      return false;
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${app.vault.sId}/apps/${app.sId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: appName.slice(0, MODELS_STRING_MAX_LENGTH),
          description: appDescription.slice(0, MODELS_STRING_MAX_LENGTH),
        }),
      }
    );
    if (res.ok) {
      await router.push(
        `/w/${owner.sId}/vaults/${app.vault.sId}/apps/${app.sId}`
      );
    } else {
      setIsUpdating(false);
      const err = (await res.json()) as { error: APIError };
      window.alert(
        `Failed to update the app (contact support@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
      );
    }
  };

  useEffect(() => {
    setDisabled(!formValidation());

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appName]);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl(owner, app.vault));
          }}
        />
      }
    >
      <div className="flex w-full flex-col">
        <Tab
          className="mt-2"
          tabs={subNavigationApp({ owner, app, current: "settings" })}
        />
        <div className="mt-8 flex flex-1">
          <div className="space-y-8 divide-y divide-gray-200">
            <div className="space-y-4 divide-y divide-gray-200">
              <div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
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
                            : "border-gray-300 focus:border-action-500 focus:ring-action-500"
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
                        optional but highly recommended
                      </div>
                    </div>
                    <div className="mt-1 flex rounded-md shadow-sm">
                      <input
                        type="text"
                        name="description"
                        id="appDescription"
                        className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-action-500 focus:ring-action-500"
                        value={appDescription}
                        onChange={(e) => setAppDescription(e.target.value)}
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      This description guides assistants in understanding how to
                      use your app effectively and determines its relevance in
                      responding to user inquiries. If you don't provide a
                      description, members won't be able to select this app in
                      the Assistant Builder.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex py-6">
              <Button
                disabled={disable || isUpdating || isDeleting}
                onClick={handleUpdate}
                label={isUpdating ? "Updating..." : "Update"}
              />
              <div className="flex-1"></div>
              <div className="ml-2 flex">
                <Button
                  variant="secondaryWarning"
                  onClick={handleDelete}
                  disabled={isDeleting || isUpdating}
                  label={isDeleting ? "Deleting..." : "Delete"}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
