import "@uiw/react-textarea-code-editor/dist.css";

import { Button, Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import DatasetView from "@app/components/app/DatasetView";
import { DustAppPageLayout } from "@app/components/apps/DustAppPageLayout";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useRegisterUnloadHandlers } from "@app/lib/front";
import { useApp } from "@app/lib/swr/apps";
import { useDatasets } from "@app/lib/swr/datasets";
import type { DatasetSchema, DatasetType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = appGetServerSideProps;

function NewDatasetView() {
  const router = useRouter();
  const { spaceId, aId } = router.query;
  const owner = useWorkspace();
  const { subscription, isBuilder } = useAuth();

  const { app, isAppLoading } = useApp({
    workspaceId: owner.sId,
    spaceId: isString(spaceId) ? spaceId : "",
    appId: isString(aId) ? aId : "",
    disabled: !isString(spaceId) || !isString(aId),
  });

  const { datasets, isDatasetsLoading } = useDatasets({
    owner,
    app: app!,
    disabled: !app,
  });

  const [disable, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<DatasetType | null>(null);
  const [schema, setSchema] = useState<DatasetSchema | null>(null);

  const [editorDirty, setEditorDirty] = useState(false);
  const [isFinishedEditing, setIsFinishedEditing] = useState(false);

  useRegisterUnloadHandlers(editorDirty);

  // Redirect non-builders
  useEffect(() => {
    if (!isBuilder && app) {
      void router.push(
        `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`
      );
    }
  }, [isBuilder, app, router, owner.sId]);

  // This is a little wonky, but in order to redirect to the dataset's main page and not pop up the
  // "You have unsaved changes" dialog, we need to set editorDirty to false and then do the router
  // redirect in the next render cycle. We use the isFinishedEditing state variable to tell us when
  // this should happen.
  useEffect(() => {
    if (isFinishedEditing && app) {
      void router.push(
        `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinishedEditing]);

  const onUpdate = (
    initializing: boolean,
    valid: boolean,
    currentDatasetInEditor: DatasetType,
    schema: DatasetSchema
  ) => {
    setDisabled(!valid);
    if (!initializing) {
      setEditorDirty(true);
    }
    if (valid) {
      setDataset(currentDatasetInEditor);
      setSchema(schema);
    }
  };

  const handleSubmit = async () => {
    if (!app) {
      return;
    }

    setLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dataset,
          schema,
        }),
      }
    );
    await res.json();
    setEditorDirty(false);
    setIsFinishedEditing(true);
  };

  const isLoading = isAppLoading || isDatasetsLoading;

  if (isLoading || !app) {
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
      currentTab="datasets"
    >
      <div className="mt-8 flex flex-col">
        <div className="flex flex-1">
          <div className="space-y-6 divide-y divide-gray-200 dark:divide-gray-200-night">
            <DatasetView
              readOnly={false}
              datasets={datasets}
              dataset={dataset}
              schema={schema}
              onUpdate={onUpdate}
              nameDisabled={false}
              viewType="full"
            />

            <div className="flex py-6">
              <Button
                label="Create"
                variant="primary"
                disabled={disable || loading}
                onClick={() => handleSubmit()}
              />
            </div>
          </div>
        </div>
      </div>
    </DustAppPageLayout>
  );
}

const PageWithAuthLayout = NewDatasetView as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
