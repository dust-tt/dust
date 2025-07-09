import {
  Button,
  CheckCircleIcon,
  ClockIcon,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import CopyRun from "@app/components/app/CopyRun";
import SpecRunView from "@app/components/app/SpecRunView";
import { ConfirmContext } from "@app/components/Confirm";
import { subNavigationApp } from "@app/components/navigation/config";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { cleanSpecificationFromCore, getRun } from "@app/lib/api/run";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { dustAppsListUrl } from "@app/lib/spaces";
import type {
  AppType,
  RunType,
  SpecificationType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isBuilder: boolean;
  isAdmin: boolean;
  app: AppType;
  run: RunType;
  spec: SpecificationType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  const isBuilder = auth.isBuilder();
  const isAdmin = auth.isAdmin();

  const app = await AppResource.fetchById(auth, context.params?.aId as string);
  if (!app) {
    return {
      notFound: true,
    };
  }

  const r = await getRun(auth, app.toJSON(), context.params?.runId as string);
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
      isBuilder,
      isAdmin,
      app: app.toJSON(),
      spec,
      run,
    },
  };
});

export default function AppRun({
  owner,
  subscription,
  isBuilder,
  isAdmin,
  app,
  spec,
  run,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [savedRunId, setSavedRunId] = useState<string | null | undefined>(
    app.savedRun
  );
  const [isLoading, setIsLoading] = useState(false);
  const confirm = useContext(ConfirmContext);

  const restore = async () => {
    if (!isBuilder) {
      return;
    }

    if (
      !(await confirm({
        title: "Double checking",
        message: `This will revert the app specification to the state it was in when this run was saved (${run.run_id}). Are you sure?`,
        validateVariant: "warning",
      }))
    ) {
      return;
    }

    setIsLoading(true);

    // hacky way to make a deep copy of the spec
    const specCopy = JSON.parse(JSON.stringify(spec));

    cleanSpecificationFromCore(specCopy);

    await fetch(
      `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/state`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          specification: JSON.stringify(specCopy),
          config: JSON.stringify(run.config.blocks),
          run: run.run_id,
        }),
      }
    );

    setIsLoading(false);
    setSavedRunId(run.run_id);
  };

  const router = useRouter();

  return (
    <AppContentLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl(owner, app.space));
          }}
        />
      }
    >
      <div className="flex w-full flex-col">
        <Tabs value="runs" className="mt-2">
          <TabsList className="inline-flex h-10 items-center gap-2 border-b border-separator">
            {subNavigationApp({ owner, app, current: "runs" }).map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                label={item.label}
                icon={item.icon}
                onClick={() => {
                  void router.push(item.href);
                }}
              />
            ))}
          </TabsList>
        </Tabs>
        <div className="mt-8 flex flex-col">
          <div className="mb-4 flex flex-row items-center justify-between space-x-2 text-sm">
            <div className="flex flex-col items-start">
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
              {run.app_hash ? (
                <div className="flex items-center text-xs italic text-gray-400">
                  <span>
                    Specification Hash:{" "}
                    <span className="ml-1 hidden font-mono text-gray-400 sm:inline">
                      {run.app_hash}
                    </span>
                    <span className="ml-1 font-mono text-gray-400 sm:hidden">
                      {run.app_hash.slice(0, 8)}...{run.app_hash.slice(-8)}
                    </span>
                  </span>
                </div>
              ) : null}
            </div>
            <p className="flex items-center gap-x-2 text-xs text-gray-400">
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
                  variant="outline"
                />
              )}
              <CopyRun
                owner={owner}
                app={app}
                run={run}
                disabled={false}
                spec={spec}
              />
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-auto flex-col">
          <SpecRunView
            owner={owner}
            app={app}
            isAdmin={isAdmin}
            readOnly={true}
            showOutputs={isBuilder}
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
    </AppContentLayout>
  );
}

AppRun.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
