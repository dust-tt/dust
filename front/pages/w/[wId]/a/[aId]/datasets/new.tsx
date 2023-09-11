import "@uiw/react-textarea-code-editor/dist.css";

import { Button, Tab } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Router, { useRouter } from "next/router";
import { useEffect, useState } from "react";

import DatasetView from "@app/components/app/DatasetView";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  subNavigationAdmin,
  subNavigationApp,
} from "@app/components/sparkle/navigation";
import { getApp } from "@app/lib/api/app";
import { getDatasets } from "@app/lib/api/datasets";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useRegisterUnloadHandlers } from "@app/lib/front";
import { AppType } from "@app/types/app";
import { DatasetType } from "@app/types/dataset";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  app: AppType;
  datasets: DatasetType[];
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const app = await getApp(auth, context.params?.aId as string);

  if (!app) {
    return {
      notFound: true,
    };
  }

  const datasets = await getDatasets(auth, app);

  return {
    props: {
      user,
      owner,
      app,
      datasets,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function NewDatasetView({
  user,
  owner,
  app,
  datasets,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState(null as DatasetType | null);

  const [editorDirty, setEditorDirty] = useState(false);
  const [isFinishedEditing, setIsFinishedEditing] = useState(false);

  useRegisterUnloadHandlers(editorDirty);

  // This is a little wonky, but in order to redirect to the dataset's main page and not pop up the
  // "You have unsaved changes" dialog, we need to set editorDirty to false and then do the router
  // redirect in the next render cycle. We use the isFinishedEditing state variable to tell us when
  // this should happen.
  useEffect(() => {
    if (isFinishedEditing) {
      void Router.push(`/w/${owner.sId}/a/${app.sId}/datasets`);
    }
  }, [app.sId, isFinishedEditing, owner.sId]);

  const onUpdate = (
    initializing: boolean,
    valid: boolean,
    currentDatasetInEditor: DatasetType
  ) => {
    setDisabled(!valid);
    if (!initializing) {
      setEditorDirty(true);
    }
    if (valid) {
      setDataset(currentDatasetInEditor);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    const res = await fetch(`/api/w/${owner.sId}/apps/${app.sId}/datasets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataset),
    });
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
            <div className="space-y-6 divide-y divide-gray-200">
              <DatasetView
                readOnly={false}
                datasets={datasets}
                dataset={dataset}
                onUpdate={onUpdate}
                nameDisabled={false}
              />

              <div className="flex flex-row pt-6">
                <div className="flex-initial">
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
      </div>
    </AppLayout>
  );
}
