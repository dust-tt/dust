import {
  ArrowLeftCircleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useState } from "react";

import MainTab from "@app/components/app/MainTab";
import SpecRunView from "@app/components/app/SpecRunView";
import AppLayout from "@app/components/AppLayout";
import { ActionButton } from "@app/components/Button";
import { getApp } from "@app/lib/api/app";
import { getRun } from "@app/lib/api/run";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { AppType, SpecificationType } from "@app/types/app";
import { RunType } from "@app/types/run";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  app: AppType;
  run: RunType;
  spec: SpecificationType;
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

  let r = await getRun(auth, app, context.params?.runId as string);
  if (!r) {
    return {
      notFound: true,
    };
  }
  const { run, spec } = r;

  return {
    props: {
      user,
      owner,
      readOnly,
      app,
      spec,
      run,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppRun({
  user,
  owner,
  readOnly,
  app,
  spec,
  run,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [savedRunId, setSavedRunId] = useState<string | null | undefined>(
    app.savedRun
  );
  const [isLoading, setIsLoading] = useState(false);

  const restore = async () => {
    if (readOnly) {
      return;
    }

    if (
      !confirm(
        `This will revert the app specification to the state it was in when this run was saved (${run.run_id}). Are you sure?`
      )
    ) {
      return;
    }

    setIsLoading(true);

    // hacky way to make a deep copy of the spec
    const specCopy = JSON.parse(JSON.stringify(spec));

    for (const block of specCopy) {
      // we clear out the config for input blocks because the dataset might
      // have changed or might not exist anymore
      if (block.type === "input") {
        block.config = {};
      }

      // we have to remove the hash and ID of the dataset in data blocks
      // to prevent the app from becoming un-runable
      if (block.type === "data") {
        delete block.spec.dataset_id;
        delete block.spec.hash;
      }
    }

    await fetch(`/api/w/${owner.sId}/apps/${app.sId}/state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        specification: JSON.stringify(specCopy),
        config: JSON.stringify(run.config.blocks),
        run: run.run_id,
      }),
    });

    setIsLoading(false);
    setSavedRunId(run.run_id);
    logger.info(
      {
        app: app.sId,
        run: run.run_id,
      },
      "Restored app to previous run"
    );
  };

  return (
    <AppLayout user={user} app={app} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab app={app} currentTab="Specification" owner={owner} />
        </div>
        <div className="mx-auto mt-4 w-full max-w-5xl">
          <div className="mx-2 sm:mx-4 lg:mx-8">
            <div className="mb-4 mt-6 flex flex-row items-center justify-between space-x-2 text-sm">
              <div className="flex items-center">
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
              <p className="flex items-center text-xs text-gray-400">
                {savedRunId !== run.run_id ? (
                  <>
                    {" "}
                    <ActionButton onClick={restore} disabled={isLoading}>
                      <ArrowLeftCircleIcon className="-ml-1 mr-1 h-5 w-5" />
                      {isLoading ? "Restoring..." : "Restore"}
                    </ActionButton>
                  </>
                ) : (
                  <>
                    {" "}
                    <ActionButton disabled={true}>
                      <CheckCircleIcon className="-ml-1 mr-1 h-5 w-5" />
                      Latest version
                    </ActionButton>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="mx-2 flex flex-auto flex-col sm:mx-4 lg:mx-8">
            <SpecRunView
              owner={owner}
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
