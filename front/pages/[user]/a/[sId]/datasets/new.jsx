import AppLayout from "../../../../../components/app/AppLayout";
import MainTab from "../../../../../components/app/MainTab";
import { ActionButton } from "../../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../api/auth/[...nextauth]";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import "@uiw/react-textarea-code-editor/dist.css";
import Router from "next/router";
import DatasetView from "../../../../../components/app/DatasetView";
import { useRegisterUnloadHandlers } from "../../../../../lib/front";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function NewDatasetView({
  app,
  datasets,
  user,
  ga_tracking_id,
}) {
  const { data: session } = useSession();

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
      Router.push(`/${session.user.username}/a/${app.sId}/datasets`);
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
    const res = await fetch(
      `/api/apps/${session.user.username}/${app.sId}/datasets`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataset),
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
          />
        </div>

        <div className="w-full max-w-5xl mt-4 mx-auto">
          <div className="flex flex-1">
            <div className="w-full px-4 sm:px-6 mb-8">
              <div className="space-y-6 divide-y divide-gray-200 mt-4">
                <DatasetView
                  datasets={datasets}
                  dataset={dataset}
                  onUpdate={onUpdate}
                />

                <div className="pt-6 flex flex-row">
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
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  if (!session) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (context.query.user != session.user.username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  const [appRes, datasetsRes] = await Promise.all([
    fetch(`${URL}/api/apps/${session.user.username}/${context.query.sId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }),
    fetch(
      `${URL}/api/apps/${session.user.username}/${context.query.sId}/datasets`,
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
      user: session.user.username,
      session,
      app: app.app,
      datasets: datasets.datasets,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
