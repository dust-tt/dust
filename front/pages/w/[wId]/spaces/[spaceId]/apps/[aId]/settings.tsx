import { Button, Input, Label, Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useContext, useState } from "react";
import { useEffect } from "react";

import { DustAppPageLayout } from "@app/components/apps/DustAppPageLayout";
import { ConfirmContext } from "@app/components/Confirm";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { dustAppsListUrl } from "@app/lib/spaces";
import { useApp } from "@app/lib/swr/apps";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";
import type { APIError } from "@app/types";
import { APP_NAME_REGEXP, isString } from "@app/types";

export const getServerSideProps = appGetServerSideProps;

function SettingsView() {
  const router = useRouter();
  const { spaceId, aId } = router.query;
  const owner = useWorkspace();
  const { subscription, isBuilder } = useAuth();

  const { spaceInfo: space, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: isString(spaceId) ? spaceId : null,
  });

  const { app, isAppLoading } = useApp({
    workspaceId: owner.sId,
    spaceId: isString(spaceId) ? spaceId : "",
    appId: isString(aId) ? aId : "",
    disabled: !isString(spaceId) || !isString(aId),
  });

  const [disable, setDisabled] = useState(true);

  const [appName, setAppName] = useState("");
  const [appNameError, setAppNameError] = useState<boolean>(false);
  const [appDescription, setAppDescription] = useState("");

  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const confirm = useContext(ConfirmContext);

  // Initialize form values when app loads
  useEffect(() => {
    if (app) {
      setAppName(app.name);
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      setAppDescription(app.description || "");
    }
  }, [app]);

  const formValidation = () => {
    if (appName.length == 0) {
      setAppNameError(false);
      return false;
    } else if (!appName.match(APP_NAME_REGEXP)) {
      setAppNameError(true);
      return false;
    } else {
      setAppNameError(false);
      return true;
    }
  };

  const handleDelete = async () => {
    if (!app || !space) {
      return false;
    }

    if (
      await confirm({
        title: "Double checking",
        message: "Are you sure you want to delete this app?",
        validateVariant: "warning",
      })
    ) {
      setIsDeleting(true);
      const res = await clientFetch(
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
    if (!app) {
      return;
    }

    setIsUpdating(true);
    const res = await clientFetch(
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

  // Redirect non-builders
  useEffect(() => {
    if (!isBuilder && app && space) {
      void router.push(`/w/${owner.sId}/spaces/${space.sId}/apps/${app.sId}`);
    }
  }, [isBuilder, app, space, router, owner.sId]);

  const isLoading = isSpaceInfoLoading || isAppLoading;

  if (isLoading || !app || !space) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <DustAppPageLayout
      owner={owner}
      subscription={subscription}
      app={app}
      currentTab="settings"
    >
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
                message="Description needed to use in Agent Builder - helps agents understand when to use your app."
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
    </DustAppPageLayout>
  );
}

const PageWithAuthLayout = SettingsView as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
