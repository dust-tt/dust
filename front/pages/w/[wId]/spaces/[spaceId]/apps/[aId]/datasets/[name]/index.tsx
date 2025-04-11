import "@uiw/react-textarea-code-editor/dist.css";

import { Button, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import DatasetView from "@app/components/app/DatasetView";
import { subNavigationApp } from "@app/components/navigation/config";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getDatasetHash, getDatasetSchema } from "@app/lib/api/datasets";
import { useRegisterUnloadHandlers } from "@app/lib/front";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { dustAppsListUrl } from "@app/lib/spaces";
import type { WorkspaceType } from "@app/types";
import type { AppType } from "@app/types";
import type { DatasetSchema, DatasetType } from "@app/types";
import type { SubscriptionType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  app: AppType;
  dataset: DatasetType;
  schema: DatasetSchema | null;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const { aId } = context.params;
  if (typeof aId !== "string") {
    return {
      notFound: true,
    };
  }

  const app = await AppResource.fetchById(auth, aId);
  if (!app) {
    return {
      notFound: true,
    };
  }

  const dataset = await getDatasetHash(
    auth,
    app,
    context.params?.name as string,
    "latest"
  );

  if (!dataset) {
    return {
      notFound: true,
    };
  }

  const schema = await getDatasetSchema(auth, app, dataset.name);

  return {
    props: {
      owner,
      subscription,
      readOnly,
      app: app.toJSON(),
      dataset,
      schema,
    },
  };
});

export default function ViewDatasetView({
  owner,
  subscription,
  readOnly,
  app,
  dataset,
  schema,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [disable, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const [editorDirty, setEditorDirty] = useState(false);
  const [isFinishedEditing, setIsFinishedEditing] = useState(false);
  const [updatedDataset, setUpdatedDataset] = useState(dataset);
  const [updatedSchema, setUpdatedSchema] = useState<DatasetSchema | null>(
    schema
  );

  useRegisterUnloadHandlers(editorDirty);

  // This is a little wonky, but in order to redirect to the dataset's main page and not pop up the
  // "You have unsaved changes" dialog, we need to set editorDirty to false and then do the router
  // redirect in the next render cycle. We use the isFinishedEditing state variable to tell us when
  // this should happen.
  useEffect(() => {
    if (isFinishedEditing) {
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
    if (readOnly) {
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
    setLoading(true);
    const res = await fetch(
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

  return (
    <AppContentLayout
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
                  schema={schema}
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
    </AppContentLayout>
  );
}

ViewDatasetView.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
