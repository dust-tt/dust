import { Button, cn, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { subNavigationApp } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { dustAppsListUrl } from "@app/lib/spaces";
import { useRuns } from "@app/lib/swr/apps";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";
import type { AppType } from "@app/types";
import type { SubscriptionType } from "@app/types";
import type { RunRunType, RunStatus } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  app: AppType;
  wIdTarget: string | null;
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

  return {
    props: {
      owner,
      subscription,
      readOnly,
      app: app.toJSON(),
      wIdTarget,
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
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      title={
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
        <div className="mt-8 flex">
          <nav className="flex" aria-label="Tabs">
            {tabs.map((tab, tabIdx) => (
              <a
                key={tab.name}
                className={classNames(
                  tab.runType == runType
                    ? cn(
                        "border-border bg-primary-700 text-foreground hover:bg-primary-800",
                        "dark:border-border-night dark:bg-primary-300 dark:text-foreground-night dark:hover:bg-primary-200"
                      )
                    : cn(
                        "border-border bg-background text-muted-foreground hover:bg-muted-background hover:text-muted-foreground",
                        "dark:border-border-night dark:bg-background-night dark:text-muted-foreground-night dark:hover:bg-muted-background-night dark:hover:text-muted-foreground-night"
                      ),
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
                variant="outline"
                size="xs"
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
                variant="outline"
                size="xs"
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
          <div className="mt-4 flex flex-auto pl-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
            Showing runs {offset + 1} - {last} of {total} runs
          </div>
        ) : null}

        <div className="mt-4">
          <ul role="list" className="space-y-4">
            {runs.map((run) => (
              <li key={run.run_id} className="px-0">
                <div className="rounded border border-border px-4 py-4 dark:border-border-night">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-initial">
                      <Link
                        href={`/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/${run.run_id}`}
                        className="block"
                      >
                        <p className="truncate font-mono text-base text-highlight-500 dark:text-highlight-500-night">
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
                    <div className="flex flex-1 flex-wrap items-center space-x-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {run.status.blocks.map((block) => (
                        <span
                          key={`${block.block_type}-${block.name}`}
                          className={classNames(
                            "rounded-md px-1 text-sm font-semibold",
                            block.status == "succeeded"
                              ? "bg-primary-100"
                              : "bg-red-100"
                          )}
                        >
                          {block.name}
                        </span>
                      ))}
                      <span className="ml-2 pt-1 font-mono text-xs text-muted-foreground dark:text-muted-foreground-night">
                        ({inputCount(run.status)} inputs)
                      </span>
                    </div>
                    <div className="mt-2 flex items-center pr-1 text-sm text-muted-foreground dark:text-muted-foreground-night sm:mt-0">
                      <p>{timeAgoFrom(run.created)} ago</p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {runs.length == 0 ? (
              <div className="mt-10 flex flex-col items-center justify-center text-sm text-muted-foreground dark:text-muted-foreground-night">
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
    </AppCenteredLayout>
  );
}

RunsView.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
