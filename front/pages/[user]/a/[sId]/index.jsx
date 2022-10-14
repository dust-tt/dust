import AppLayout from "../../../../components/app/AppLayout";
import MainTab from "../../../../components/app/MainTab";
import { ActionButton } from "../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]";
import { PlayCircleIcon } from "@heroicons/react/20/solid";
import NewBlock from "../../../../components/app/NewBlock";
import {
  addBlock,
  deleteBlock,
  moveBlockDown,
  moveBlockUp,
} from "../../../../lib/specification";
import { useState, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import Root from "../../../../components/app/blocks/Root";
import Data from "../../../../components/app/blocks/Data";
import LLM from "../../../../components/app/blocks/LLM";
import Code from "../../../../components/app/blocks/Code";
import { Map, Reduce } from "../../../../components/app/blocks/MapReduce";
import { extractConfig } from "../../../../lib/config";
import { useSavedRunStatus } from "../../../../lib/swr";
import { mutate } from "swr";
import { useSession } from "next-auth/react";

const { URL } = process.env;

let saveTimeout = null;

const isRunnable = (readOnly, spec, config) => {
  if (readOnly) return false;

  for (const name in config) {
    for (const key in config[name]) {
      if (!config[name][key] || config[name][key].length == 0) {
        return false;
      }
    }
  }
  for (const name in spec) {
    let block = spec[name];
    switch (block.type) {
      case "data":
        if (!block.spec.dataset || block.spec.dataset.length == 0) {
          return false;
        }
      default:
        if (!block.name || block.name.length == 0) {
          return false;
        }
    }
  }
  return true;
};

export default function App({ app, readOnly, user }) {
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
            if (runRequested) {
              setRunRequested(false);
            }
            return 0;
        }
      }
      return 0;
    }
  );

  const bottomRef = useRef(null);

  const saveState = async (spec, config) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    saveTimeout = setTimeout(async () => {
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
    }, 1000);
  };

  const update = (s) => {
    let c = extractConfig(s);
    setRunnable(isRunnable(readOnly, s, c));
    setSpec(s);
    setConfig(c);
    saveState(s, c);
  };

  const handleNewBlock = (blockType) => {
    let s = addBlock(spec, blockType);
    update(s);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const handleRun = async () => {
    setRunRequested(true);
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
      mutate(`/api/apps/${session.user.username}/${app.sId}/runs/saved/status`);

      // Mutate all blocks to trigger a refresh of `useSavedRunBlock` in each block `Output`.
      spec.forEach((block) => {
        mutate(
          `/api/apps/${session.user.username}/${app.sId}/runs/saved/blocks/${block.type}/${block.name}`
        );
      });
    }
  };

  return (
    <AppLayout app={{ sId: app.sId, name: app.name }}>
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
            <div className="flex flex-row my-4 space-x-2 items-center">
              <div className="flex">
                <NewBlock
                  disabled={readOnly}
                  onClick={handleNewBlock}
                  spec={spec}
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

            {/* This is a hack to force loading the component before we render the LLM blocks.
                Otherwise the autoresize does not work on init?
                TODO(spolu): investigate
            */}
            <TextareaAutosize className="hidden" value="foo" />

            <div className="flex flex-col space-y-2 mb-12">
              {spec.map((block, idx) => {
                // Match status with block
                let status = null;
                if (
                  run &&
                  run.status &&
                  idx < run.status.blocks.length &&
                  run.status.blocks[idx].block_type == block.type &&
                  run.status.blocks[idx].name == block.name
                ) {
                  status = run.status.blocks[idx];
                }
                switch (block.type) {
                  case "input":
                    return (
                      <Root
                        key={idx}
                        block={block}
                        user={user}
                        app={app}
                        status={status}
                        running={runRequested || run?.status.run == "running"}
                        readOnly={readOnly}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "data":
                    return (
                      <Data
                        key={idx}
                        block={block}
                        user={user}
                        app={app}
                        status={status}
                        running={runRequested || run?.status.run == "running"}
                        readOnly={readOnly}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "llm":
                    return (
                      <LLM
                        key={idx}
                        block={block}
                        user={user}
                        app={app}
                        status={status}
                        running={runRequested || run?.status.run == "running"}
                        readOnly={readOnly}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "code":
                    return (
                      <Code
                        key={idx}
                        block={block}
                        user={user}
                        app={app}
                        status={status}
                        running={runRequested || run?.status.run == "running"}
                        readOnly={readOnly}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "map":
                    return (
                      <Map
                        key={idx}
                        block={block}
                        user={user}
                        app={app}
                        status={status}
                        running={runRequested || run?.status.run == "running"}
                        readOnly={readOnly}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "reduce":
                    return (
                      <Reduce
                        key={idx}
                        block={block}
                        user={user}
                        app={app}
                        status={status}
                        running={runRequested || run?.status.run == "running"}
                        readOnly={readOnly}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  default:
                    return (
                      <div key={idx} className="flex flex-row px-4 py-4">
                        Unknown block type: {block.type}
                      </div>
                    );
                    break;
                }
              })}
            </div>
          </div>
        </div>
        <div ref={bottomRef}></div>
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

  const [app] = await Promise.all([appRes.json()]);

  return {
    props: { session, app: app.app, readOnly, user: context.query.user },
  };
}
