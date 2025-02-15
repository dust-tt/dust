import {
  Button,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { AppType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { APP_NAME_REGEXP } from "@dust-tt/types";
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
import { dustAppsListUrl } from "@app/lib/spaces";
import { MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";

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

  const { spaceId } = context.query;
  if (typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  if (!auth.isBuilder()) {
    return {
      redirect: {
        destination: `/w/${owner.sId}/spaces/${context.query.spaceId}/apps/${context.query.aId}`,
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
  const [appNameError, setAppNameError] = useState<boolean>(false);

  const [appDescription, setAppDescription] = useState(app.description || "");

  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const confirm = useContext(ConfirmContext);

  const formValidation = () => {
    if (appName.length == 0) {
      setAppNameError(false);
      return false;
      // eslint-disable-next-line no-useless-escape
    } else if (!appName.match(APP_NAME_REGEXP)) {
      setAppNameError(true);
      return false;
    } else {
      setAppNameError(false);
      return true;
    }
  };

  const router = useRouter();

  const handleDelete = async () => {
    if (
      await confirm({
        title: "Double checking",
        message: "Are you sure you want to delete this app?",
        validateVariant: "warning",
      })
    ) {
      setIsDeleting(true);
      const res = await fetch(
        `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        await router.push(dustAppsListUrl(owner, app.space));
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
      `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: appName,
          description: appDescription.slice(0, MODELS_STRING_MAX_LENGTH),
        }),
      }
    );
    if (res.ok) {
      await router.push(
        `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}`
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
            void router.push(dustAppsListUrl(owner, app.space));
          }}
        />
      }
    >
      <div className="flex flex-col">
        <Tabs value="settings" className="mt-2">
          <TabsList>
            {subNavigationApp({ owner, app, current: "settings" }).map(
              (tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  label={tab.label}
                  icon={tab.icon}
                  onClick={() => {
                    if (tab.href) {
                      void router.push(tab.href);
                    }
                  }}
                />
              )
            )}
          </TabsList>
        </Tabs>
        <div className="mt-8 flex flex-1">
          <div className="flex flex-col">
            <div className="flex flex-col gap-6">
              <div className="flex w-64 flex-col gap-2">
                <Label>App Name</Label>
                <Input
                  type="text"
                  name="name"
                  id="appName"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  message="Use only a-z, 0-9, - or _. Must be unique."
                  messageStatus={appNameError ? "error" : "default"}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Description</Label>
                <Input
                  type="text"
                  name="description"
                  id="appDescription"
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  message="Description needed to use in Assistant Builder - helps assistants understand when to use your app."
                  messageStatus="default"
                />
              </div>
            </div>
            <div className="flex justify-between py-6">
              <Button
                disabled={disable || isUpdating || isDeleting}
                onClick={handleUpdate}
                label={isUpdating ? "Updating..." : "Update"}
              />
              <Button
                variant="warning"
                onClick={handleDelete}
                disabled={isDeleting || isUpdating}
                label={isDeleting ? "Deleting..." : "Delete"}
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
