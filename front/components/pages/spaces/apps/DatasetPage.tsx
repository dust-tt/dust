import "@uiw/react-textarea-code-editor/dist.css";

import { Button, Spinner, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import DatasetView from "@app/components/app/DatasetView";
import { subNavigationApp } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useRegisterUnloadHandlers } from "@app/lib/front";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { dustAppsListUrl } from "@app/lib/spaces";
import { useApp } from "@app/lib/swr/apps";
import { useDataset } from "@app/lib/swr/datasets";
import Custom404 from "@app/pages/404";
import type { DatasetSchema, DatasetType } from "@app/types/dataset";

export function DatasetPage() {
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const aId = useRequiredPathParam("aId");
  const name = useRequiredPathParam("name");
  const owner = useWorkspace();
  const { subscription, isBuilder } = useAuth();
  const readOnly = !isBuilder;

  const { app, isAppLoading } = useApp({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
  });

  const { dataset, isDatasetLoading, isDatasetError } = useDataset(
    owner,
    app,
    name,
    true // showData
  );

  const [disable, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const [editorDirty, setEditorDirty] = useState(false);
  const [isFinishedEditing, setIsFinishedEditing] = useState(false);
  const [updatedDataset, setUpdatedDataset] = useState<DatasetType | null>(
    null
  );
  const [updatedSchema, setUpdatedSchema] = useState<DatasetSchema | null>(
    null
  );
  const [initialized, setInitialized] = useState(false);

  useRegisterUnloadHandlers(editorDirty);

  // Initialize state when dataset loads
  useEffect(() => {
    if (dataset && !initialized) {
      setUpdatedDataset(dataset);
      setUpdatedSchema(dataset.schema ?? null);
      setInitialized(true);
    }
  }, [dataset, initialized]);

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
    if (readOnly || !dataset) {
      return;
    }
    setDisabled(!valid);
    if (
      !initializing &&
      (currentDatasetInEditor.data !== dataset.data ||
        currentDatasetInEditor.name !== dataset.name ||
        (currentDatasetInEditor.description !== dataset.description &&
          (currentDatasetInEditor.description || dataset.description)))
    ) {
      setEditorDirty(true);
    } else {
      setEditorDirty(false);
    }
    if (valid) {
      setUpdatedDataset(currentDatasetInEditor);
      setUpdatedSchema(schema);
    }
  };

  const handleSubmit = async () => {
    if (!app || !dataset) {
      return;
    }

    setLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/${dataset.name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dataset: updatedDataset,
          schema: updatedSchema,
        }),
      }
    );
    await res.json();
    setEditorDirty(false);
    setIsFinishedEditing(true);
  };

  const isLoading = isAppLoading || isDatasetLoading;

  // Show 404 on error or if dataset not found after loading completes
  if (isDatasetError || (!isLoading && app && !dataset)) {
    return <Custom404 />;
  }

  if (isLoading || !app || !dataset || !updatedDataset) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      title={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl(owner, app.space));
          }}
        />
      }
    >
      <div className="flex w-full flex-col">
        <Tabs value="datasets" className="mt-2">
          <TabsList>
            {subNavigationApp({ owner, app, current: "datasets" }).map(
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
        <div className="mt-8 flex flex-col">
          <div className="flex flex-1">
            <div className="mb-8 w-full">
              <div className="space-y-6 divide-y divide-gray-200 dark:divide-gray-200-night">
                <DatasetView
                  readOnly={readOnly}
                  datasets={[] as DatasetType[]}
                  dataset={updatedDataset}
                  schema={dataset.schema ?? null}
                  onUpdate={onUpdate}
                  nameDisabled={true}
                  viewType="full"
                />

                {readOnly ? null : (
                  <div className="flex flex-row pt-6">
                    <div className="flex-initial">
                      <Button
                        disabled={disable || loading}
                        onClick={() => handleSubmit()}
                        label="Update"
                        variant="primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppCenteredLayout>
  );
}
