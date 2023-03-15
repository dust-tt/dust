import AppLayout from "../../../../../components/AppLayout";
import MainTab from "../../../../../components/app/MainTab";
import { ActionButton, Button } from "../../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../api/auth/[...nextauth]";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { classNames, utcDateFrom, timeAgoFrom } from "../../../../../lib/utils";
import Router from "next/router";
import { useState } from "react";
import { useRuns } from "../../../../../lib/swr";

const { URL, GA_TRACKING_ID = null } = process.env;

const tabs = [
  { name: "Local", runType: "local" },
  { name: "API", runType: "deploy" },
];

const inputCount = (status) => {
  for (var i = 0; i < status.blocks.length; i++) {
    if (status.blocks[i].block_type == "input") {
      return (
        status.blocks[i].error_count || 0 + status.blocks[i].success_count || 0
      );
    }
  }
  return 0;
};

export default function RunsView({ app, user, readOnly, ga_tracking_id }) {
  const { data: session } = useSession();

  const [runType, setRunType] = useState("local");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  let { runs, total, isRunsLoading, isRunsError } = useRuns(
    user,
    app,
    limit,
    offset,
    runType
  );

  let last = offset + limit;
  if (offset + limit > total) {
    last = total;
  }

  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
      ga_tracking_id={ga_tracking_id}
    >
      <div className="leadingflex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Runs"
            user={user}
            readOnly={readOnly}
          />
        </div>
        <div className="w-full max-w-5xl mt-4 mx-auto">
          <div className="flex flex-1">
            <div className="flex flex-auto flex-col mx-2 sm:mx-4 lg:mx-8 my-4">
              <div className="flex w-full">
                <nav className="flex" aria-label="Tabs">
                  {tabs.map((tab, tabIdx) => (
                    <a
                      key={tab.name}
                      className={classNames(
                        tab.runType == runType
                          ? "border-gray-700 hover:bg-gray-800 bg-gray-700 text-white"
                          : "border-gray-300 hover:bg-gray-50 bg-white text-gray-700 hover:text-gray-700",
                        tabIdx === 0 ? "rounded-l-md" : "",
                        tabIdx === tabs.length - 1 ? "rounded-r-md" : "",
                        "flex-1 py-1 px-3 text-sm border font-medium text-center focus:z-10 cursor-pointer shadow-sm"
                      )}
                      aria-current={tab.current ? "page" : undefined}
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
                  <div className="flex ml-2">
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
                <div className="flex flex-auto text-gray-700 text-sm mt-3 pl-1">
                  Showing runs {offset + 1} - {last} of {total} runs
                </div>
              ) : null}

              <div className="mt-4">
                <ul role="list" className="space-y-4">
                  {runs.map((run) => (
                    <li key={run.run_id} className="px-0">
                      <div className="py-4 rounded border border-gray-300 px-4 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-initial">
                            <Link
                              href={`/${user}/a/${app.sId}/runs/${run.run_id}`}
                              className="block"
                            >
                              <p className="truncate text-base font-mono text-violet-600">
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
                          <div className="flex flex-1 flex-wrap items-center text-sm text-gray-700 space-x-1">
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
                            <span className="text-xs font-mono text-gray-700 ml-2 pt-1">
                              ({inputCount(run.status)} inputs)
                            </span>
                          </div>
                          <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 pr-1">
                            <p>{timeAgoFrom(run.created)} ago</p>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                  {runs.length == 0 ? (
                    <div className="flex flex-col items-center justify-center text-sm text-gray-500 mt-10">
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

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  let readOnly = !session || context.query.user !== session.user.username;

  const [appRes, datasetsRes] = await Promise.all([
    fetch(`${URL}/api/apps/${context.query.user}/${context.query.sId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }),
    fetch(
      `${URL}/api/apps/${context.query.user}/${context.query.sId}/datasets`,
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
      session,
      app: app.app,
      datasets: datasets.datasets,
      readOnly,
      user: context.query.user,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
