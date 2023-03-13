import AppLayout from "../../../../../../components/app/AppLayout";
import MainTab from "../../../../../../components/app/MainTab";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../api/auth/[...nextauth]";
import SpecRunView from "../../../../../../components/app/SpecRunView";
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
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            current_tab="Specification"
            user={user}
            readOnly={readOnly}
          />
        </div>
        <div className="w-full max-w-5xl mt-4 mx-auto">
          <div className="flex flex-auto flex-col mx-2 sm:mx-4 lg:mx-8">
            <div className="flex flex-row mb-4 mt-6 space-x-2 items-center text-sm">
              <span>
                Viewing run:{" "}
                <span className="hidden sm:inline font-mono text-gray-600 ml-1">
                  {run.run_id}
                </span>
                <span className="sm:hidden font-mono text-gray-600 ml-1">
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
