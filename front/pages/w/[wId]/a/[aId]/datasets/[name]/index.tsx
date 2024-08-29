import "@uiw/react-textarea-code-editor/dist.css";

import { Button, Tab } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { DatasetSchema, DatasetType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import DatasetView from "@app/components/app/DatasetView";
import {
  subNavigationApp,
  subNavigationBuild,
} from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { getApp } from "@app/lib/api/app";
import { getDatasetHash, getDatasetSchema } from "@app/lib/api/datasets";
import { useRegisterUnloadHandlers } from "@app/lib/front";
import { withDefaultUserAuthRequirementsNoWorkspaceCheck } from "@app/lib/iam/session";
import { getDustAppsListUrl } from "@app/lib/vault_rollout";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps =
  withDefaultUserAuthRequirementsNoWorkspaceCheck<{
    owner: WorkspaceType;
    subscription: SubscriptionType;
    readOnly: boolean;
    app: AppType;
    dataset: DatasetType;
    schema: DatasetSchema | null;
    dustAppsListUrl: string;
    gaTrackingId: string;
  }>(async (context, auth) => {
    const owner = auth.workspace();
    const subscription = auth.subscription();

    if (!owner || !subscription) {
      return {
        notFound: true,
      };
    }

    const readOnly = !auth.isBuilder();

    const app = await getApp(auth, context.params?.aId as string);

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
        app,
        dataset,
        schema,
        dustAppsListUrl: await getDustAppsListUrl(auth),
        gaTrackingId: GA_TRACKING_ID,
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
  dustAppsListUrl,
  gaTrackingId,
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
      void router.push(`/w/${owner.sId}/a/${app.sId}/datasets`);
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
      `/api/w/${owner.sId}/apps/${app.sId}/datasets/${dataset.name}`,
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
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "developers",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl);
          }}
        />
      }
      hideSidebar
    >
      <div className="flex w-full flex-col">
        <Tab
          className="mt-2"
          tabs={subNavigationApp({ owner, app, current: "datasets" })}
        />
        <div className="mt-8 flex flex-col">
          <div className="flex flex-1">
            <div className="mb-8 w-full">
              <div className="space-y-6 divide-y divide-gray-200">
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
    </AppLayout>
  );
}
