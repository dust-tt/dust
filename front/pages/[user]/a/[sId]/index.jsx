import AppLayout from "../../../../components/app/AppLayout";
import MainTab from "../../../../components/app/MainTab";
import { ActionButton } from "../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]";
import {
  PlayCircleIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/20/solid";
import NewBlock from "../../../../components/app/NewBlock";
import {
  addBlock,
  deleteBlock,
  moveBlockDown,
  moveBlockUp,
} from "../../../../lib/specification";
import { useState, useRef } from "react";
import SpecRunView from "../../../../components/app/SpecRunView";
import { extractConfig } from "../../../../lib/config";
import { useSavedRunStatus } from "../../../../lib/swr";
import { mutate } from "swr";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Deploy from "../../../../components/app/Deploy";

const { URL, GA_TRACKING_ID = null } = process.env;

let saveTimeout = null;

const isRunnable = (readOnly, spec, config) => {
  if (readOnly) return false;

  for (const name in config) {
    for (const key in config[name]) {
      if (key != "use_cache") {
        if (!config[name][key] || config[name][key].length == 0) {
          return false;
        }
      }
    }
  }

  let block_count = 0;

  for (const name in spec) {
    block_count += 1;
    let block = spec[name];
    switch (block.type) {
      case "data":
        if (!block.spec.dataset || block.spec.dataset.length == 0) {
          return false;
        }
      default:
        if (
          !block.name ||
          block.name.length == 0 ||
          !block.name.match(/^[A-Z0-9_]+$/)
        ) {
          return false;
        }
    }
  }

  if (block_count == 0) {
    return false;
  }

  return true;
};

export default function App({ app, readOnly, user, ga_tracking_id }) {
  const { data: session } = useSession();

  const [spec, setSpec] = useState(JSON.parse(app.savedSpecification || `[]`));
  const [config, setConfig] = useState(
    extractConfig(JSON.parse(app.savedSpecification || `{}`))
  );
  const [runnable, setRunnable] = useState(isRunnable(readOnly, spec, config));
  const [runRequested, setRunRequested] = useState(false);
  const [runError, setRunError] = useState(null);

  let { run, isRunLoading, isRunError } = useSavedRunStatus(
    user,
    app,
    (data) => {
      if (data && data.run) {
        switch (data?.run.status.run) {
          case "running":
            return 100;
          default:
            return 0;
        }
      }
      return 0;
    }
  );

  // console.log(run);

  const bottomRef = useRef(null);

  const saveState = async (spec, config) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    saveTimeout = setTimeout(async () => {
      if (session) {
        const [specRes] = await Promise.all([
          fetch(`/api/apps/${session.user.username}/${app.sId}/state`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              specification: JSON.stringify(spec),
              config: JSON.stringify(config),
            }),
          }),
        ]);
        console.log("STATE SAVED", spec, config);
      }
    }, 1000);
  };

  const update = (s) => {
    let c = extractConfig(s);
    setRunnable(isRunnable(readOnly, s, c));
    setSpec(s);
    setConfig(c);
    saveState(s, c);
  };

  const handleNewBlock = (idx, blockType) => {
    let s = addBlock(spec, idx || spec.length - 1, blockType);
    update(s);
    if (idx === null) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleDeleteBlock = (idx) => {
    let s = deleteBlock(spec, idx);
    update(s);
  };

  const handleMoveBlockUp = (idx) => {
    let s = moveBlockUp(spec, idx);
    update(s);
  };

  const handleMoveBlockDown = (idx) => {
    let s = moveBlockDown(spec, idx);
    update(s);
  };

  const handleSetBlock = (idx, block) => {
    let s = spec.map((b) => b);
    // Sync map/reduce names
    if (block.type == "map" && block.name != s[idx].name) {
      for (var i = idx; i < s.length; i++) {
        if (s[i].type == "reduce" && s[i].name == s[idx].name) {
          s[i].name = block.name;
          break;
        }
      }
    }
    if (block.type == "reduce" && block.name != s[idx].name) {
      for (var i = idx; i >= 0; i--) {
        if (s[i].type == "map" && s[i].name == s[idx].name) {
          s[i].name = block.name;
          break;
        }
      }
    }
    s[idx] = block;
    update(s);
  };

  const handleRun = () => {
    setRunRequested(true);

    // We disable runRequested after 1s, time to disable the Run button while the network
    // catches-up on the run status. This may lead to flickering if the network is not great, but
    // haven't found a better solution yet.
    setTimeout(async () => {
      setRunRequested(false);
    }, 1000);

    // setTimeout to yield execution so that the button updates right away.
    setTimeout(async () => {
      const [runRes] = await Promise.all([
        fetch(`/api/apps/${session.user.username}/${app.sId}/runs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            specification: JSON.stringify(spec),
            config: JSON.stringify(config),
          }),
        }),
      ]);

      if (!runRes.ok) {
        const [error] = await Promise.all([runRes.json()]);
        setRunError(error);
      } else {
        setRunError(null);
        const [run] = await Promise.all([runRes.json()]);

        // Mutate the run status to trigger a refresh of `useSavedRunStatus`.
        mutate(
          `/api/apps/${session.user.username}/${app.sId}/runs/saved/status`
        );

        // Mutate all blocks to trigger a refresh of `useRunBlock` in each block `Output`.
        spec.forEach((block) => {
          mutate(
            `/api/apps/${session.user.username}/${app.sId}/runs/${run.run.run_id}/blocks/${block.type}/${block.name}`
          );
        });
      }
    }, 0);
  };

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
        <div className="flex flex-auto">
          <div className="flex flex-auto flex-col mx-2 sm:mx-4 lg:mx-8">
            <div className="flex flex-row flex-auto my-4 space-x-2 items-center">
              <div className="flex-initial">
                <NewBlock
                  disabled={readOnly}
                  onClick={(blockType) => {
                    handleNewBlock(null, blockType);
                  }}
                  spec={spec}
                  direction="down"
                  small={false}
                />
              </div>
              <div className="flex-initial">
                <ActionButton
                  disabled={
                    !runnable || runRequested || run?.status.run == "running"
                  }
                  onClick={() => handleRun()}
                >
                  <PlayCircleIcon className="-ml-1 mr-1 h-5 w-5 mt-0.5" />
                  {runRequested || run?.status.run == "running"
                    ? "Running"
                    : "Run"}
                </ActionButton>
              </div>
              {runError ? (
                <div className="flex-initial text-sm font-bold text-red-400 text-sm px-2">
                  {(() => {
                    switch (runError.code) {
                      case "invalid_specification_error":
                        return `Specification error: ${runError.message}`;
                      default:
                        return `Error: ${runError.message}`;
                    }
                  })()}
                </div>
              ) : null}
              {session && readOnly ? (
                <div className="flex-initial">
                  <Link href={`/${user}/a/${app.sId}/clone`}>
                    <a>
                      <ActionButton>
                        <DocumentDuplicateIcon className="-ml-1 mr-1 h-5 w-5 mt-0.5" />
                        Clone
                      </ActionButton>
                    </a>
                  </Link>
                </div>
              ) : null}
              <div className="flex-1"></div>
              {session && !readOnly ? (
                <div className="flex-initial">
                  <Deploy
                    disabled={readOnly || !(run?.status.run == "succeeded")}
                    user={user}
                    app={app}
                    run={run}
                    spec={spec}
                    direction="down"
                  />
                </div>
              ) : null}
            </div>

            <SpecRunView
              user={user}
              app={app}
              readOnly={readOnly}
              spec={spec}
              run={run}
              runRequested={runRequested}
              handleSetBlock={handleSetBlock}
              handleDeleteBlock={handleDeleteBlock}
              handleMoveBlockUp={handleMoveBlockUp}
              handleMoveBlockDown={handleMoveBlockDown}
              handleNewBlock={handleNewBlock}
            />

            {spec.length == 0 ? (
              <div className="max-w-4xl mt-2 text-sm text-gray-400">
                <p className="">
                  To get started we recommend you review Dust's{" "}
                  <a
                    href="/readme"
                    target="_blank"
                    className="font-bold text-violet-500 underline"
                  >
                    README
                  </a>{" "}
                  and/or explore and potentially clone{" "}
                  <a
                    href="https://dust.tt/spolu/a/2316f9c6b0"
                    className="font-bold text-violet-600 underline"
                    target="_blank"
                  >
                    a
                  </a>{" "}
                  <a
                    href="https://dust.tt/spolu/a/d12ac33169"
                    className="font-bold text-violet-500 underline"
                    target="_blank"
                  >
                    working
                  </a>{" "}
                  <a
                    href="https://dust.tt/bcmejla/a/cc20d98f70"
                    className="font-bold text-violet-500 underline"
                    target="_blank"
                  >
                    example
                  </a>
                  .
                </p>
                <p className="py-2">
                  When ready, start adding blocks to your app.
                </p>
              </div>
            ) : null}

            {spec.length > 2 && !readOnly ? (
              <div className="flex flex-row my-4 space-x-2 items-center">
                <div className="flex">
                  <NewBlock
                    disabled={readOnly}
                    onClick={(blockType) => {
                      handleNewBlock(null, blockType);
                    }}
                    spec={spec}
                    direction="up"
                    small={false}
                  />
                </div>
                <div className="flex">
                  <ActionButton
                    disabled={
                      !runnable || runRequested || run?.status.run == "running"
                    }
                    onClick={() => handleRun()}
                  >
                    <PlayCircleIcon className="-ml-1 mr-1 h-5 w-5 mt-0.5" />
                    {runRequested || run?.status.run == "running"
                      ? "Running"
                      : "Run"}
                  </ActionButton>
                </div>
                {runError ? (
                  <div className="flex text-sm font-bold text-red-400 text-sm px-2">
                    {(() => {
                      switch (runError.code) {
                        case "invalid_specification_error":
                          return `Specification error: ${runError.message}`;
                        default:
                          return `Error: ${runError.message}`;
                      }
                    })()}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div ref={bottomRef} className="mt-4"></div>
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
    return {
      notFound: true,
    };
  }

  const [app] = await Promise.all([appRes.json()]);

  return {
    props: {
      session,
      app: app.app,
      readOnly,
      user: context.query.user,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
