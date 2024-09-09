import { Button, Tab } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { RunRunType, RunStatus } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import {
  subNavigationApp,
  subNavigationBuild,
} from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { useRuns } from "@app/lib/swr/apps";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import { getDustAppsListUrl } from "@app/lib/vault_rollout";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  app: AppType;
  wIdTarget: string | null;
  dustAppsListUrl: string;
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

  const app = await AppResource.fetchById(auth, context.params?.aId as string);
  if (!app) {
    return {
      notFound: true,
    };
  }

  // `wIdTarget` is used to change the workspace owning the runs of the apps we're looking at.
  // Mostly useful for debugging as an example our use of `dust-apps` as `dust`.
  const wIdTarget = (context.query?.wIdTarget as string) || null;
  const dustAppsListUrl = await getDustAppsListUrl(auth);

  return {
    props: {
      owner,
      subscription,
      readOnly,
      app: app.toJSON(),
      wIdTarget,
      dustAppsListUrl,
      gaTrackingId: config.getGaTrackingId(),
    },
  };
});

const TABS = [
  { name: "Design", runType: "local", ownerOwnly: true },
  { name: "API", runType: "deploy", ownerOwnly: false },
] as { name: string; runType: RunRunType; ownerOwnly: boolean }[];

const inputCount = (status: RunStatus) => {
  for (let i = 0; i < status.blocks.length; i++) {
    if (status.blocks[i].block_type == "input") {
      return (
        status.blocks[i].error_count || 0 + status.blocks[i].success_count || 0
      );
    }
  }
  return 0;
};

export default function RunsView({
  owner,
  subscription,
  readOnly,
  app,
  wIdTarget,
  dustAppsListUrl,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [runType, setRunType] = useState(
    (wIdTarget ? "deploy" : "local") as RunRunType
  );
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const [tabs, setTabs] = useState(
    [] as { name: string; runType: RunRunType; ownerOwnly: boolean }[]
  );
  useEffect(() => {
    setTabs(
      TABS.filter((tab) => {
        return !(tab.ownerOwnly && readOnly);
      })
    );
  }, [readOnly]);

  const { runs, total } = useRuns(
    owner,
    app,
    limit,
    offset,
    runType,
    wIdTarget
  );

  let last = offset + limit;
  if (offset + limit > total) {
    last = total;
  }

  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "developers",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl);
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
        <div className="mt-8 flex">
          <nav className="flex" aria-label="Tabs">
            {tabs.map((tab, tabIdx) => (
              <a
                key={tab.name}
                className={classNames(
                  tab.runType == runType
                    ? "border-gray-700 bg-gray-700 text-white hover:bg-gray-800"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-700",
                  tabIdx === 0 ? "rounded-l-2xl border-r-0" : "",
                  tabIdx === tabs.length - 1 ? "rounded-r-2xl border-l-0" : "",
                  "flex flex-1 cursor-pointer flex-row border px-3 text-sm font-medium focus:z-10"
                )}
                onClick={() => setRunType(tab.runType)}
              >
                <div className="flex items-center">{tab.name}</div>
              </a>
            ))}
          </nav>

          <div className="flex flex-1"></div>
          <div className="flex flex-initial">
            <div className="flex">
              <Button
                variant="tertiary"
                disabled={offset < limit}
                onClick={() => {
                  if (offset >= limit) {
                    setOffset(offset - limit);
                  } else {
                    setOffset(0);
                  }
                }}
                label="Previous"
              />
            </div>
            <div className="ml-2 flex">
              <Button
                variant="tertiary"
                disabled={offset + limit >= total}
                onClick={() => {
                  if (offset + limit < total) {
                    setOffset(offset + limit);
                  }
                }}
                label="Next"
              />
            </div>
          </div>
        </div>

        {runs.length > 0 ? (
          <div className="mt-4 flex flex-auto pl-1 text-sm text-gray-700">
            Showing runs {offset + 1} - {last} of {total} runs
          </div>
        ) : null}

        <div className="mt-4">
          <ul role="list" className="space-y-4">
            {runs.map((run) => (
              <li key={run.run_id} className="px-0">
                <div className="rounded border border-gray-300 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-initial">
                      <Link
                        href={`/w/${owner.sId}/a/${app.sId}/runs/${run.run_id}`}
                        className="block"
                      >
                        <p className="font-mono truncate text-base text-action-500">
                          {run.run_id.slice(0, 8)}...
                          {run.run_id.slice(-8)}
                        </p>
                      </Link>
                    </div>
                    <div className="ml-2 flex flex-shrink-0">
                      <p
                        className={classNames(
                          "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                          run.status.run == "succeeded"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        )}
                      >
                        {run.status.run}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <div className="flex flex-1 flex-wrap items-center space-x-1 text-sm text-gray-700">
                      {run.status.blocks.map((block) => (
                        <span
                          key={`${block.block_type}-${block.name}`}
                          className={classNames(
                            "rounded-md px-1 text-sm font-semibold",
                            block.status == "succeeded"
                              ? "bg-gray-100"
                              : "bg-red-100"
                          )}
                        >
                          {block.name}
                        </span>
                      ))}
                      <span className="font-mono ml-2 pt-1 text-xs text-gray-700">
                        ({inputCount(run.status)} inputs)
                      </span>
                    </div>
                    <div className="mt-2 flex items-center pr-1 text-sm text-gray-500 sm:mt-0">
                      <p>{timeAgoFrom(run.created)} ago</p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {runs.length == 0 ? (
              <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
                <p>No runs found 🔎</p>
                {runType == "local" ? (
                  <p className="mt-2">
                    Runs triggered from Dust will appear here.
                  </p>
                ) : (
                  <p className="mt-2">
                    Runs triggered by API will appear here.
                  </p>
                )}
              </div>
            ) : null}
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
