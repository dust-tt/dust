import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/app/MainTab";
import { Button } from "@app/components/Button";
import Link from "next/link";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import { useState } from "react";
import { useRuns } from "@app/lib/swr";
import { auth_user } from "@app/lib/auth";

const { URL, GA_TRACKING_ID = null } = process.env;

const tabs = [
  { name: "Design", runType: "local" },
  { name: "Execute", runType: "execute" },
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

export default function RunsView({
  authUser,
  owner,
  readOnly,
  app,
  ga_tracking_id,
}) {
  const [runType, setRunType] = useState("local");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  let { runs, total, isRunsLoading, isRunsError } = useRuns(
    owner.username,
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
        <div className="mt-2 flex flex-initial">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Logs"
            owner={owner}
            readOnly={readOnly}
          />
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
                        "flex-1 cursor-pointer border py-1 px-3 text-center text-sm font-medium shadow-sm focus:z-10"
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
                      <div className="rounded border border-gray-300 py-4 py-4 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-initial">
                            <Link
                              href={`/${owner.username}/a/${app.sId}/runs/${run.run_id}`}
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

export async function getServerSideProps(context) {
  let authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return { noFound: true };
  }
  let auth = authRes.value;

  let readOnly =
    auth.isAnonymous() || context.query.user !== auth.user().username;

  const [appRes] = await Promise.all([
    fetch(`${URL}/api/apps/${context.query.user}/${context.query.sId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }),
  ]);

  if (appRes.status === 404) {
    return { notFound: true };
  }

  const [app] = await Promise.all([appRes.json()]);

  return {
    props: {
      session: auth.session(),
      authUser: auth.isAnonymous() ? null : auth.user(),
      owner: { username: context.query.user },
      readOnly,
      app: app.app,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
