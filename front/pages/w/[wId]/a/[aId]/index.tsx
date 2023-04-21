import {
  DocumentDuplicateIcon,
  PlayCircleIcon,
} from "@heroicons/react/20/solid";
import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRef, useState } from "react";
import { mutate } from "swr";

import Deploy from "@app/components/app/Deploy";
import MainTab from "@app/components/app/MainTab";
import NewBlock from "@app/components/app/NewBlock";
import SpecRunView from "@app/components/app/SpecRunView";
import AppLayout from "@app/components/AppLayout";
import { ActionButton, Button } from "@app/components/Button";
import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import { DustAPIErrorResponse } from "@app/lib/dust_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import {
  addBlock,
  deleteBlock,
  moveBlockDown,
  moveBlockUp,
} from "@app/lib/specification";
import { useSavedRunStatus } from "@app/lib/swr";
import {
  AppType,
  BlockRunConfig,
  SpecificationBlockType,
  SpecificationType,
} from "@app/types/app";
import { BlockType } from "@app/types/run";
import { UserType, WorkspaceType } from "@app/types/user";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  url: string;
  app: AppType;
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

  return {
    props: {
      user,
      owner,
      readOnly,
      url: URL,
      app,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

let saveTimeout = null as string | number | NodeJS.Timeout | null;

const isRunnable = (
  readOnly: boolean,
  spec: SpecificationType,
  config: BlockRunConfig
) => {
  if (readOnly) return false;

  for (const name in config) {
    for (const key in config[name]) {
      if (key != "use_cache" && key != "error_as_output") {
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

export default function AppView({
  user,
  owner,
  readOnly,
  app,
  url,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [spec, setSpec] = useState(
    JSON.parse(app.savedSpecification || `[]`) as SpecificationType
  );
  const [config, setConfig] = useState(
    extractConfig(JSON.parse(app.savedSpecification || `{}`))
  );
  const [runnable, setRunnable] = useState(isRunnable(readOnly, spec, config));
  const [runRequested, setRunRequested] = useState(false);
  const [runError, setRunError] = useState(null as null | DustAPIErrorResponse);

  let { run, isRunLoading, isRunError } = useSavedRunStatus(
    owner,
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

  const bottomRef = useRef<HTMLDivElement>(null);

  const saveState = async (spec: SpecificationType, config: BlockRunConfig) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    saveTimeout = setTimeout(async () => {
      if (!readOnly) {
        const [specRes] = await Promise.all([
          fetch(`/api/w/${owner.sId}/apps/${app.sId}/state`, {
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

  const update = (s: SpecificationType) => {
    let c = extractConfig(s);
    setRunnable(isRunnable(readOnly, s, c));
    setSpec(s);
    setConfig(c);
    saveState(s, c);
  };

  const handleNewBlock = (
    idx: number | null,
    blockType: BlockType | "map_reduce" | "while_end"
  ) => {
    let s = addBlock(spec, idx === null ? spec.length - 1 : idx, blockType);
    update(s);
    if (idx === null) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleDeleteBlock = (idx: number) => {
    let s = deleteBlock(spec, idx);
    update(s);
  };

  const handleMoveBlockUp = (idx: number) => {
    let s = moveBlockUp(spec, idx);
    update(s);
  };

  const handleMoveBlockDown = (idx: number) => {
    let s = moveBlockDown(spec, idx);
    update(s);
  };

  const handleSetBlock = (idx: number, block: SpecificationBlockType) => {
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
        fetch(`/api/w/${owner.sId}/apps/${app.sId}/runs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            specification: JSON.stringify(spec),
            config: JSON.stringify(config),
            mode: "design",
          }),
        }),
      ]);

      if (!runRes.ok) {
        const error: ReturnedAPIErrorType = await runRes.json();
        setRunError(error.error.run_error as DustAPIErrorResponse);
      } else {
        setRunError(null);
        const [run] = await Promise.all([runRes.json()]);

        // Mutate the run status to trigger a refresh of `useSavedRunStatus`.
        mutate(`/api/w/${owner.sId}/apps/${app.sId}/runs/saved/status`);

        // Mutate all blocks to trigger a refresh of `useRunBlock` in each block `Output`.
        spec.forEach((block) => {
          mutate(
            `/api/w/${owner.sId}/apps/${app.sId}/runs/${run.run.run_id}/blocks/${block.type}/${block.name}`
          );
        });
      }
    }, 0);
  };

  return (
    <AppLayout user={user} owner={owner} app={app} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab app={app} currentTab="Specification" owner={owner} />
        </div>
        <div className="mx-auto mt-4 flex w-full max-w-5xl flex-auto">
          <div className="mx-2 flex flex-auto flex-col sm:mx-4 lg:mx-8">
            <div className="my-4 flex flex-auto flex-row items-center space-x-2">
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
                  <PlayCircleIcon className="-ml-1 mr-1 mt-0.5 h-5 w-5" />
                  {runRequested || run?.status.run == "running"
                    ? "Running"
                    : "Run"}
                </ActionButton>
              </div>
              {runError ? (
                <div className="flex-initial px-2 text-sm text-sm font-bold text-red-400">
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
              {readOnly && user ? (
                <div className="flex-initial">
                  <Link href={`/w/${owner.sId}/a/${app.sId}/clone`}>
                    <ActionButton>
                      <DocumentDuplicateIcon className="-ml-1 mr-1 mt-0.5 h-5 w-5" />
                      Clone
                    </ActionButton>
                  </Link>
                </div>
              ) : null}
              <div className="flex-1"></div>
              {!readOnly && run ? (
                <div className="flex-initial">
                  <Deploy
                    disabled={readOnly || !(run?.status.run == "succeeded")}
                    owner={owner}
                    app={app}
                    run={run}
                    spec={spec}
                    url={url}
                  />
                </div>
              ) : null}
            </div>

            <SpecRunView
              owner={owner}
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
              <div className="mx-auto mt-8 text-sm text-gray-400">
                <p className="">Welcome to your new Dust app.</p>
                <p className="mt-4">To get started:</p>
                <p className="mt-2">
                  <Link
                    href="https://docs.dust.tt"
                    target="_blank"
                    className="mr-2"
                  >
                    <Button>
                      <ArrowRightCircleIcon className="-ml-1 mr-2 h-4 w-4" />
                      View Documentation
                    </Button>
                  </Link>
                </p>
                <p className="mt-2">
                  <Link
                    href="https://docs.dust.tt/quickstart"
                    target="_blank"
                    className="mr-2"
                  >
                    <Button>
                      <ArrowRightCircleIcon className="-ml-1 mr-2 h-4 w-4" />
                      Follow the QuickStart Guide
                    </Button>
                  </Link>
                </p>
                <p className="mt-2">...or add your first block!</p>
              </div>
            ) : null}

            {spec.length > 2 && !readOnly ? (
              <div className="my-4 flex flex-row items-center space-x-2">
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
                    <PlayCircleIcon className="-ml-1 mr-1 mt-0.5 h-5 w-5" />
                    {runRequested || run?.status.run == "running"
                      ? "Running"
                      : "Run"}
                  </ActionButton>
                </div>
                {runError ? (
                  <div className="flex px-2 text-sm text-sm font-bold text-red-400">
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
