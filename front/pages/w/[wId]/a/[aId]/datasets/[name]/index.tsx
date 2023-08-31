import "@uiw/react-textarea-code-editor/dist.css";

import { Tab } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Router, { useRouter } from "next/router";
import { useEffect, useState } from "react";

import DatasetView from "@app/components/app/DatasetView";
import { ActionButton } from "@app/components/Button";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  subNavigationAdmin,
  subNavigationApp,
} from "@app/components/sparkle/navigation";
import { getApp } from "@app/lib/api/app";
import { getDatasetHash } from "@app/lib/api/datasets";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useRegisterUnloadHandlers } from "@app/lib/front";
import { AppType } from "@app/types/app";
import { DatasetType } from "@app/types/dataset";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  app: AppType;
  dataset: DatasetType;
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

  return {
    props: {
      user,
      owner,
      readOnly,
      app,
      dataset,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function ViewDatasetView({
  user,
  owner,
  readOnly,
  app,
  dataset,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const [editorDirty, setEditorDirty] = useState(false);
  const [isFinishedEditing, setIsFinishedEditing] = useState(false);
  const [updatedDataset, setUpdatedDataset] = useState(dataset);

  useRegisterUnloadHandlers(editorDirty);

  // This is a little wonky, but in order to redirect to the dataset's main page and not pop up the
  // "You have unsaved changes" dialog, we need to set editorDirty to false and then do the router
  // redirect in the next render cycle. We use the isFinishedEditing state variable to tell us when
  // this should happen.
  useEffect(() => {
    if (isFinishedEditing) {
      void Router.push(`/w/${owner.sId}/a/${app.sId}/datasets`);
    }
  }, [isFinishedEditing]);

  const onUpdate = (
    initializing: boolean,
    valid: boolean,
    currentDatasetInEditor: DatasetType
  ) => {
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
        body: JSON.stringify(updatedDataset),
      }
    );
    await res.json();
    setEditorDirty(false);
    setIsFinishedEditing(true);
  };

  const router = useRouter();

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({
        owner,
        current: "developers",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(`/w/${owner.sId}/a`);
          }}
        />
      }
    >
      <div className="flex w-full flex-col">
        <div className="mt-2">
          <Tab tabs={subNavigationApp({ owner, app, current: "datasets" })} />
        </div>
        <div className="mt-8 flex flex-col">
          <div className="flex flex-1">
            <div className="mb-8 w-full">
              <div className="space-y-6 divide-y divide-gray-200">
                <DatasetView
                  readOnly={readOnly}
                  datasets={[] as DatasetType[]}
                  dataset={updatedDataset}
                  onUpdate={(
                    initializing: boolean,
                    valid: boolean,
                    currentDatasetInEditor: DatasetType
                  ) => {
                    if (!readOnly) {
                      onUpdate(initializing, valid, currentDatasetInEditor);
                    }
                  }}
                  nameDisabled={true}
                />

                {readOnly ? null : (
                  <div className="flex flex-row pt-6">
                    <div className="flex-initial">
                      <ActionButton
                        disabled={disable || loading}
                        onClick={() => handleSubmit()}
                      >
                        Update
                      </ActionButton>
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
