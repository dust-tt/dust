import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/app/MainTab";
import { ActionButton } from "@app/components/Button";
import { useState, useEffect } from "react";
import "@uiw/react-textarea-code-editor/dist.css";
import Router from "next/router";
import DatasetView from "@app/components/app/DatasetView";
import { useRegisterUnloadHandlers } from "@app/lib/front";
import { auth_user } from "@app/lib/auth";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function NewDatasetView({
  authUser,
  owner,
  app,
  datasets,
  ga_tracking_id,
}) {
  const [disable, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState(null);

  const [editorDirty, setEditorDirty] = useState(false);
  const [isFinishedEditing, setIsFinishedEditing] = useState(false);

  useRegisterUnloadHandlers(editorDirty);

  // This is a little wonky, but in order to redirect to the dataset's main page and not pop up the
  // "You have unsaved changes" dialog, we need to set editorDirty to false and then do the router
  // redirect in the next render cycle. We use the isFinishedEditing state variable to tell us when
  // this should happen.
  useEffect(() => {
    if (isFinishedEditing) {
      Router.push(`/${owner.username}/a/${app.sId}/datasets`);
    }
  }, [isFinishedEditing]);

  const onUpdate = (initializing, valid, currentDatasetInEditor) => {
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
    const res = await fetch(`/api/apps/${owner.username}/${app.sId}/datasets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataset),
    });
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
        <div className="mt-2 flex flex-initial">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Datasets"
            owner={owner}
          />
        </div>

        <div className="mx-auto mt-4 w-full max-w-5xl">
          <div className="flex flex-1">
            <div className="mb-8 w-full px-4 sm:px-6">
              <div className="mt-4 space-y-6 divide-y divide-gray-200">
                <DatasetView
                  datasets={datasets}
                  dataset={dataset}
                  onUpdate={onUpdate}
                />

                <div className="flex flex-row pt-6">
                  <div className="flex-initial">
                    <ActionButton
                      disabled={disable || loading}
                      onClick={() => handleSubmit()}
                    >
                      Create
                    </ActionButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export async function getServerSideProps(context) {
  let authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return { noFound: true };
  }
  let auth = authRes.value();

  if (auth.isAnonymous()) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (context.query.user != auth.user().username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  const [appRes, datasetsRes] = await Promise.all([
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
  ]);

  if (appRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [app, datasets] = await Promise.all([
    appRes.json(),
    datasetsRes.json(),
  ]);

  return {
    props: {
      session: auth.session(),
      authUser: auth.user(),
      owner: { username: context.query.user },
      app: app.app,
      datasets: datasets.datasets,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
