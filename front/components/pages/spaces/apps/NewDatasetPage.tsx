import "@uiw/react-textarea-code-editor/dist.css";

import { Button, Spinner } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import DatasetView from "@app/components/app/DatasetView";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useRegisterUnloadHandlers } from "@app/lib/front";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { useApp } from "@app/lib/swr/apps";
import { useDatasets } from "@app/lib/swr/datasets";
import Custom404 from "@app/pages/404";
import type { DatasetSchema, DatasetType } from "@app/types/dataset";

export function NewDatasetPage() {
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const aId = useRequiredPathParam("aId");
  const owner = useWorkspace();
  const { isBuilder } = useAuth();

  const { app, isAppLoading, isAppError } = useApp({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
  });

  const { datasets, isDatasetsLoading } = useDatasets({
    owner,
    app,
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

  // Show 404 on error or if app not found after loading completes
  if (isAppError || (!isLoading && !app)) {
    return <Custom404 />;
  }

  if (isLoading || !app) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
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
  );
}
