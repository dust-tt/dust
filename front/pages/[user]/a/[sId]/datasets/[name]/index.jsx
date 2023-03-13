import AppLayout from "../../../../../../components/app/AppLayout";
import MainTab from "../../../../../../components/app/MainTab";
import { ActionButton } from "../../../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../api/auth/[...nextauth]";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import "@uiw/react-textarea-code-editor/dist.css";
import Router from "next/router";
import DatasetView from "../../../../../../components/app/DatasetView";
import { useRegisterUnloadHandlers } from "../../../../../../lib/front";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function ViewDatasetView({
  app,
  datasets,
  dataset,
  user,
  readOnly,
  ga_tracking_id,
}) {
  const { data: session } = useSession();

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
      Router.push(`/${session.user.username}/a/${app.sId}/datasets`);
    }
  }, [isFinishedEditing]);

  const onUpdate = (initializing, valid, currentDatasetInEditor) => {
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
      `/api/apps/${session.user.username}/${app.sId}/datasets/${dataset.name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedDataset),
      }
    );
    const data = await res.json();
    setEditorDirty(false);
    setIsFinishedEditing(true);
  };

  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
      ga_tracking_id={ga_tracking_id}
    >
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            current_tab="Datasets"
            user={user}
            readOnly={readOnly}
          />
        </div>
        <div className="w-full max-w-5xl mt-4 mx-auto">
          <div className="flex flex-1">
            <div className="w-full px-4 sm:px-6 mb-8">
              <div className="space-y-6 divide-y divide-gray-200 mt-4">
                <DatasetView
                  readOnly={readOnly}
                  datasets={datasets}
                  dataset={updatedDataset}
                  onUpdate={readOnly ? () => {} : onUpdate}
                  nameDisabled={true}
                />

                {readOnly ? null : (
                  <div className="pt-6 flex flex-row">
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

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  let readOnly = !session || context.query.user !== session.user.username;

  const [appRes, datasetsRes, datasetRes] = await Promise.all([
    fetch(`${URL}/api/apps/${context.query.user}/${context.query.sId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }),
    fetch(
      `${URL}/api/apps/${context.query.user}/${context.query.sId}/datasets`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: context.req.headers.cookie,
        },
      }
    ),
    fetch(
      `${URL}/api/apps/${context.query.user}/${context.query.sId}/datasets/${context.query.name}/latest`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: context.req.headers.cookie,
        },
      }
    ),
  ]);

  if (appRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [app, datasets, dataset] = await Promise.all([
    appRes.json(),
    datasetsRes.json(),
    datasetRes.json(),
  ]);

  return {
    props: {
      session,
      app: app.app,
      datasets: datasets.datasets,
      dataset: dataset.dataset,
      user: context.query.user,
      readOnly,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
