import AppLayout from "../../../../../components/app/AppLayout";
import MainTab from "../../../../../components/app/MainTab";
import { Button } from "../../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../api/auth/[...nextauth]";
import { useSession } from "next-auth/react";
import { useState } from "react";
import "@uiw/react-textarea-code-editor/dist.css";
import Router from "next/router";
import DatasetView from "../../../../../components/app/DatasetView";

const { URL } = process.env;

export default function NewDatasetView({ app, datasets, user }) {
  const { data: session } = useSession();

  const [disable, setDisabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState(null);

  const onUpdate = (valid, dataset) => {
    setDisabled(!valid);
    if (valid) {
      setDataset(dataset);
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
    Router.push(`/${session.user.username}/a/${app.sId}/datasets`);
  };

  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
    >
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            current_tab="Datasets"
            user={user}
          />
        </div>
        <div className="flex flex-1">
          <div className="w-full px-4 sm:px-6">
            <div className="space-y-6 divide-y divide-gray-200 mt-4">
              <DatasetView
                datasets={datasets}
                dataset={dataset}
                onUpdate={onUpdate}
              />

              <div className="pt-6">
                <div className="flex">
                  <Button
                    disabled={disable || loading}
                    onClick={() => handleSubmit()}
                  >
                    Create
                  </Button>
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

  // TODO(spolu): allow public viewing of apps

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
    },
  };
}
