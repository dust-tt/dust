import "@uiw/react-textarea-code-editor/dist.css";

import { Button, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import DatasetView from "@app/components/app/DatasetView";
import { subNavigationApp } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getDatasets } from "@app/lib/api/datasets";
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
  app: AppType;
  datasets: DatasetType[];
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }

  const app = await AppResource.fetchById(auth, context.params?.aId as string);

  if (!app) {
    return {
      notFound: true,
    };
  }

  const datasets = await getDatasets(auth, app.toJSON());

  return {
    props: {
      owner,
      subscription,
      app: app.toJSON(),
      datasets,
    },
  };
});

export default function NewDatasetView({
  owner,
  subscription,
  app,
  datasets,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const [disable, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<DatasetType | null>(null);
  const [schema, setSchema] = useState<DatasetSchema | null>(null);

  const [editorDirty, setEditorDirty] = useState(false);
  const [isFinishedEditing, setIsFinishedEditing] = useState(false);

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
    setLoading(true);
    const res = await fetch(
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
      </div>
    </AppCenteredLayout>
  );
}

NewDatasetView.getLayout = function getLayout(page: React.ReactElement) {
  return <AppRootLayout>{page}</AppRootLayout>;
};
