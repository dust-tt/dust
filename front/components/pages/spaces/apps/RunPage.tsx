import { Button, CheckCircleIcon, ClockIcon, Spinner } from "@dust-tt/sparkle";
import { useContext, useState } from "react";

import CopyRun from "@app/components/app/CopyRun";
import SpecRunView from "@app/components/app/SpecRunView";
import { DustAppPageLayout } from "@app/components/apps/DustAppPageLayout";
import { ConfirmContext } from "@app/components/Confirm";
import { cleanSpecificationFromCore } from "@app/lib/api/run";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useRequiredPathParam } from "@app/lib/platform";
import { useApp, useRunWithSpec } from "@app/lib/swr/apps";
import Custom404 from "@app/pages/404";

export function RunPage() {
  const spaceId = useRequiredPathParam("spaceId");
  const aId = useRequiredPathParam("aId");
  const runId = useRequiredPathParam("runId");
  const owner = useWorkspace();
  const { subscription, isAdmin, isBuilder } = useAuth();

  const { app, isAppLoading, isAppError } = useApp({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
  });

  const { run, spec, isRunLoading, isRunError } = useRunWithSpec({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
    runId,
  });

  const [savedRunId, setSavedRunId] = useState<string | null | undefined>(null);
  const [isLoading, setIsLoading] = useState(false);
  const confirm = useContext(ConfirmContext);

  // Initialize savedRunId when app loads
  if (app && savedRunId === null) {
    setSavedRunId(app.savedRun);
  }

  const restore = async () => {
    if (!isBuilder || !app || !run || !spec) {
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

    await clientFetch(
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

  const pageIsLoading = isAppLoading || isRunLoading;

  // Show 404 on error or if app/run not found after loading completes
  if (isAppError || isRunError || (!pageIsLoading && (!app || !run))) {
    return <Custom404 />;
  }

  if (pageIsLoading || !app || !run || !spec) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <DustAppPageLayout
      owner={owner}
      subscription={subscription}
      app={app}
      currentTab="runs"
    >
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
    </DustAppPageLayout>
  );
}
