import { Button, CheckCircleIcon, ClockIcon, Tab } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType, SpecificationType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { RunType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import SpecRunView from "@app/components/app/SpecRunView";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  subNavigationApp,
  subNavigationBuild,
} from "@app/components/sparkle/navigation";
import { getApp } from "@app/lib/api/app";
import { getRun } from "@app/lib/api/run";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  app: AppType;
  run: RunType;
  spec: SpecificationType;
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

  const r = await getRun(auth, app, context.params?.runId as string);
  if (!r) {
    return {
      notFound: true,
    };
  }
  const { run, spec } = r;

  return {
    props: {
      owner,
      subscription,
      readOnly,
      app,
      spec,
      run,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function AppRun({
  owner,
  subscription,
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
  };

  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
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
      hideSidebar
    >
      <div className="flex w-full flex-col">
        <Tab
          className="mt-2"
          tabs={subNavigationApp({ owner, app, current: "runs" })}
        />
        <div className="mt-8 flex flex-col">
          <div className="mb-4 flex flex-row items-center justify-between space-x-2 text-sm">
            <div className="flex flex-col items-start">
              <div className="flex items-center">
                <span>
                  Viewing run:{" "}
                  <span className="font-mono ml-1 hidden text-gray-600 sm:inline">
                    {run.run_id}
                  </span>
                  <span className="font-mono ml-1 text-gray-600 sm:hidden">
                    {run.run_id.slice(0, 8)}...{run.run_id.slice(-8)}
                  </span>
                </span>
              </div>
              {run.app_hash ? (
                <div className="flex items-center text-xs italic text-gray-400">
                  <span>
                    Specification Hash:{" "}
                    <span className="font-mono ml-1 hidden text-gray-400 sm:inline">
                      {run.app_hash}
                    </span>
                    <span className="font-mono ml-1 text-gray-400 sm:hidden">
                      {run.app_hash.slice(0, 8)}...{run.app_hash.slice(-8)}
                    </span>
                  </span>
                </div>
              ) : null}
            </div>
            <p className="flex items-center text-xs text-gray-400">
              {savedRunId !== run.run_id ? (
                <Button
                  onClick={restore}
                  disabled={isLoading}
                  icon={ClockIcon}
                  label={isLoading ? "Restoring..." : "Restore"}
                />
              ) : (
                <Button
                  disabled={true}
                  icon={CheckCircleIcon}
                  label="Latest version"
                  variant="secondary"
                />
              )}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-auto flex-col">
          <SpecRunView
            owner={owner}
            app={app}
            readOnly={true}
            spec={spec}
            run={run}
            runRequested={false}
            handleSetBlock={() => {
              // no-op
            }}
            handleDeleteBlock={() => {
              // no-op
            }}
            handleMoveBlockUp={() => {
              // no-op
            }}
            handleMoveBlockDown={() => {
              // no-op
            }}
            handleNewBlock={() => {
              // no-op
            }}
          />
        </div>
        <div className="mt-4"></div>
      </div>
    </AppLayout>
  );
}
