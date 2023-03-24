import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/app/MainTab";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import SpecRunView from "@app/components/app/SpecRunView";
import { useSession } from "next-auth/react";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function AppRun({
  app,
  spec,
  config,
  run,
  readOnly,
  user,
  ga_tracking_id,
}) {
  const { data: session } = useSession();

  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
      ga_tracking_id={ga_tracking_id}
    >
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Specification"
            user={user}
            readOnly={readOnly}
          />
        </div>
        <div className="mx-auto mt-4 w-full max-w-5xl">
          <div className="mx-2 flex flex-auto flex-col sm:mx-4 lg:mx-8">
            <div className="mb-4 mt-6 flex flex-row items-center space-x-2 text-sm">
              <span>
                Viewing run:{" "}
                <span className="ml-1 hidden font-mono text-gray-600 sm:inline">
                  {run.run_id}
                </span>
                <span className="ml-1 font-mono text-gray-600 sm:hidden">
                  {run.run_id.slice(0, 8)}...{run.run_id.slice(-8)}
                </span>
              </span>
            </div>

            <SpecRunView
              user={user}
              app={app}
              readOnly={true}
              spec={spec}
              run={run}
              runRequested={false}
              handleSetBlock={() => {}}
              handleDeleteBlock={() => {}}
              handleMoveBlockUp={() => {}}
              handleMoveBlockDown={() => {}}
              handleNewBlock={() => {}}
            />
          </div>
        </div>
        <div className="mt-4"></div>
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

  const [appRunRes] = await Promise.all([
    fetch(
      `${URL}/api/apps/${context.query.user}/${context.query.sId}/runs/${context.query.runId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: context.req.headers.cookie,
        },
      }
    ),
  ]);

  if (appRunRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [appRun] = await Promise.all([appRunRes.json()]);

  return {
    props: {
      session,
      app: appRun.app,
      spec: appRun.spec,
      config: appRun.config,
      run: appRun.run,
      readOnly,
      user: context.query.user,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
