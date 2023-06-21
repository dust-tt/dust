import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import MainTab from "@app/components/app/MainTab";
import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useRuns } from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import { AppType } from "@app/types/app";
import { RunRunType, RunStatus } from "@app/types/run";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  app: AppType;
  wIdTarget: string | null;
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

  // `wIdTarget` is used to change the workspace owning the runs of the apps we're looking at.
  // Mostly useful for debugging as an example our use of `dust-apps` as `dust`.
  const wIdTarget = (context.query?.wIdTarget as string) || null;
  console.log("WIDTARGET", wIdTarget);

  return {
    props: {
      user,
      owner,
      readOnly,
      app,
      wIdTarget,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

const TABS = [
  { name: "Design", runType: "local", ownerOwnly: true },
  { name: "Execute", runType: "execute", ownerOwnly: false },
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
  user,
  owner,
  readOnly,
  app,
  wIdTarget,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [runType, setRunType] = useState("local" as RunRunType);
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

  return (
    <AppLayout user={user} owner={owner} app={app} gaTrackingId={gaTrackingId}>
      <div className="leadingflex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab app={app} currentTab="Logs" owner={owner} />
        </div>
        <div className="mx-auto mt-4 w-full max-w-5xl">
          <div className="flex flex-1">
            <div className="mx-2 my-4 flex flex-auto flex-col sm:mx-4 lg:mx-8">
              <div className="flex w-full">
                <nav className="flex" aria-label="Tabs">
                  {tabs.map((tab, tabIdx) => (
                    <a
                      key={tab.name}
                      className={classNames(
                        tab.runType == runType
                          ? "border-gray-700 bg-gray-700 text-white hover:bg-gray-800"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-700",
                        tabIdx === 0 ? "rounded-l-md" : "",
                        tabIdx === tabs.length - 1 ? "rounded-r-md" : "",
                        "flex-1 cursor-pointer border px-3 py-1 text-center text-sm font-medium shadow-sm focus:z-10"
                      )}
                      onClick={() => setRunType(tab.runType)}
                    >
                      <div className="py-0.5">{tab.name}</div>
                    </a>
                  ))}
                </nav>

                <div className="flex flex-1"></div>
                <div className="flex flex-initial">
                  <div className="flex">
                    <Button
                      disabled={offset < limit}
                      onClick={() => {
                        if (offset >= limit) {
                          setOffset(offset - limit);
                        } else {
                          setOffset(0);
                        }
                      }}
                    >
                      Previous
                    </Button>
                  </div>
                  <div className="ml-2 flex">
                    <Button
                      disabled={offset + limit >= total}
                      onClick={() => {
                        if (offset + limit < total) {
                          setOffset(offset + limit);
                        }
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>

              {runs.length > 0 ? (
                <div className="mt-3 flex flex-auto pl-1 text-sm text-gray-700">
                  Showing runs {offset + 1} - {last} of {total} runs
                </div>
              ) : null}

              <div className="mt-4">
                <ul role="list" className="space-y-4">
                  {runs.map((run) => (
                    <li key={run.run_id} className="px-0">
                      <div className="rounded border border-gray-300 px-4 py-4 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-initial">
                            <Link
                              href={`/w/${owner.sId}/a/${app.sId}/runs/${run.run_id}`}
                              className="block"
                            >
                              <p className="truncate font-mono text-base text-violet-600">
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
                            <span className="ml-2 pt-1 font-mono text-xs text-gray-700">
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
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
