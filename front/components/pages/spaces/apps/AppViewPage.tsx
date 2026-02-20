import NewBlock from "@app/components/app/NewBlock";
import SpecRunView from "@app/components/app/SpecRunView";
import { ViewAppAPIModal } from "@app/components/app/ViewAppAPIModal";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { extractConfig } from "@app/lib/config";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import {
  addBlock,
  deleteBlock,
  moveBlockDown,
  moveBlockUp,
} from "@app/lib/specification";
import { useApp, useCancelRun, useSavedRunStatus } from "@app/lib/swr/apps";
import Custom404 from "@app/pages/404";
import type {
  BlockRunConfig,
  SpecificationBlockType,
  SpecificationType,
} from "@app/types/app";
import type { CoreAPIError } from "@app/types/core/core_api";
import type { APIErrorResponse } from "@app/types/error";
import type { BlockType } from "@app/types/run";
import {
  BracesIcon,
  Button,
  DocumentTextIcon,
  PlayIcon,
  Spinner,
  StopIcon,
} from "@dust-tt/sparkle";
import { useRef, useState } from "react";
import { useSWRConfig } from "swr";

let saveTimeout = null as string | number | NodeJS.Timeout | null;

const isRunnable = (
  readOnly: boolean,
  spec: SpecificationType,
  config: BlockRunConfig
) => {
  if (readOnly) {
    return false;
  }

  for (const name in config) {
    for (const key in config[name]) {
      if (
        key != "use_cache" &&
        key != "error_as_output" &&
        key != "function_call" &&
        key != "logprobs" &&
        key != "top_logprobs" &&
        key != "response_format"
      ) {
        if (!config[name][key] || config[name][key].length == 0) {
          return false;
        }
      }
    }
  }

  let block_count = 0;

  for (const name in spec) {
    block_count += 1;
    const block = spec[name];
    switch (block.type) {
      case "data":
        if (!block.spec.dataset || block.spec.dataset.length == 0) {
          return false;
        }
        break;
      case "database":
        if (!block.spec.query || block.spec.query.length == 0) {
          return false;
        }
        break;
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

export function AppViewPage() {
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const aId = useRequiredPathParam("aId");
  const owner = useWorkspace();
  const { isAdmin, isBuilder } = useAuth();
  const readOnly = !isBuilder;

  const { app, isAppLoading, isAppError } = useApp({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
  });

  const { mutate } = useSWRConfig();

  const [spec, setSpec] = useState<SpecificationType>([]);
  const [config, setConfig] = useState<BlockRunConfig>({});
  const [runnable, setRunnable] = useState(false);
  const [specInitialized, setSpecInitialized] = useState(false);
  const [runRequested, setRunRequested] = useState(false);
  const [runError, setRunError] = useState(null as null | CoreAPIError);
  const [cancelRequested, setCancelRequested] = useState(false);

  // Initialize spec and config when app loads
  if (app && !specInitialized) {
    const initialSpec = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      app.savedSpecification || `[]`
    ) as SpecificationType;
    const initialConfig = extractConfig(
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      JSON.parse(app.savedSpecification || `{}`)
    );
    setSpec(initialSpec);
    setConfig(initialConfig);
    setRunnable(isRunnable(readOnly, initialSpec, initialConfig));
    setSpecInitialized(true);
  }

  const { run } = useSavedRunStatus(owner, app, (data) => {
    if (data && data.run) {
      switch (data?.run.status.run) {
        case "running":
          return 100;
        default:
          return 0;
      }
    }
    return 0;
  });

  const bottomRef = useRef<HTMLDivElement>(null);

  // Check if run has been running for more than 1 hour
  const showCancelButton =
    run?.status.run === "running" &&
    run?.created &&
    Date.now() - run.created > 60 * 60 * 1000; // 1 hour in milliseconds

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  const saveState = async (spec: SpecificationType, config: BlockRunConfig) => {
    if (!app) {
      return;
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    saveTimeout = setTimeout(async () => {
      if (!readOnly) {
        await clientFetch(
          `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/state`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              specification: JSON.stringify(spec),
              config: JSON.stringify(config),
            }),
          }
        );
      }
    }, 1000);
  };

  const update = async (s: SpecificationType) => {
    const c = extractConfig(s);
    setRunnable(isRunnable(readOnly, s, c));
    setSpec(s);
    setConfig(c);
    await saveState(s, c);
  };

  const handleNewBlock = async (
    idx: number | null,
    blockType: BlockType | "map_reduce" | "while_end"
  ) => {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const s = addBlock(spec, idx === null ? spec.length - 1 : idx, blockType);
    await update(s);
    if (idx === null) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleDeleteBlock = async (idx: number) => {
    const s = deleteBlock(spec, idx);
    await update(s);
  };

  const handleMoveBlockUp = async (idx: number) => {
    const s = moveBlockUp(spec, idx);
    await update(s);
  };

  const handleMoveBlockDown = async (idx: number) => {
    const s = moveBlockDown(spec, idx);
    await update(s);
  };

  const handleSetBlock = async (idx: number, block: SpecificationBlockType) => {
    const s = spec.map((b) => b);

    // Sync map/reduce names
    if (block.type == "map" && block.name != s[idx].name) {
      for (let i = idx; i < s.length; i++) {
        if (s[i].type == "reduce" && s[i].name == s[idx].name) {
          s[i].name = block.name;
          break;
        }
      }
    }
    if (block.type == "reduce" && block.name != s[idx].name) {
      for (let i = idx; i >= 0; i--) {
        if (s[i].type == "map" && s[i].name == s[idx].name) {
          s[i].name = block.name;
          break;
        }
      }
    }

    s[idx] = block;
    await update(s);
  };

  const handleRun = () => {
    if (!app) {
      return;
    }

    setRunRequested(true);

    // We disable runRequested after 1s, time to disable the Run button while the network
    // catches-up on the run status. This may lead to flickering if the network is not great, but
    // haven't found a better solution yet.
    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
                setTimeout(async () => {
      setRunRequested(false);
    }, 1000);

    // setTimeout to yield execution so that the button updates right away.
    setTimeout(async () => {
      const [runRes] = await Promise.all([
        clientFetch(
          `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              specification: JSON.stringify(spec),
              config: JSON.stringify(config),
            }),
          }
        ),
      ]);

      if (!runRes.ok) {
        const r: APIErrorResponse = await runRes.json();
        setRunError(r.error.run_error as CoreAPIError);
      } else {
        setRunError(null);
        const [run] = await Promise.all([runRes.json()]);

        // Mutate the run status to trigger a refresh of `useSavedRunStatus`.
        await mutate(
          `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/saved/status`
        );

        // Mutate all blocks to trigger a refresh of `useRunBlock` in each block `Output`.
        await Promise.all(
          // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
          spec.map(async (block) => {
            return mutate(
              `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/${run.run.run_id}/blocks/${block.type}/${block.name}`
            );
          })
        );
      }
    }, 0);
  };

  const { doCancel } = useCancelRun({ owner, app });

  const handleCancelRun = async () => {
    if (!run?.run_id || cancelRequested || !app) {
      return;
    }

    setCancelRequested(true);
    setRunError(null);

    try {
      const success = await doCancel(run.run_id);

      if (success) {
        // Clear the cached run status
        await mutate(
          `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/saved/status`,
          { run: null },
          false
        );
        // Then revalidate to get fresh data
        await mutate(
          `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/saved/status`
        );

        // Mutate all blocks to trigger a refresh
        if (run?.run_id) {
          await Promise.all(
            // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
            spec.map(async (block) => {
              return mutate(
                `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/${run.run_id}/blocks/${block.type}/${block.name}`
              );
            })
          );
        }
      } else {
        setRunError({
          code: "cancel_error",
          message: "Failed to cancel the run",
        } as CoreAPIError);
      }
    } finally {
      setCancelRequested(false);
    }
  };

  // Show 404 on error or if app not found after loading completes
  if (isAppError || (!isAppLoading && !app)) {
    return <Custom404 />;
  }

  if (isAppLoading || !app) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 flex flex-auto flex-col">
        <div className="mb-4 flex flex-row items-center space-x-2">
          <NewBlock
            disabled={readOnly}
            onClick={async (blockType) => {
              await handleNewBlock(null, blockType);
            }}
            spec={spec}
            small={false}
          />
          {run?.status.run === "running" && showCancelButton ? (
            <Button
              variant="outline"
              disabled={cancelRequested}
              label={cancelRequested ? "Canceling..." : "Cancel"}
              onClick={() => handleCancelRun()}
              icon={StopIcon}
            />
          ) : (
            <Button
              variant="outline"
              disabled={
                !runnable || runRequested || run?.status.run == "running"
              }
              label={
                runRequested || run?.status.run == "running" ? "Running" : "Run"
              }
              onClick={() => handleRun()}
              icon={PlayIcon}
            />
          )}
          {runError ? (
            <div className="flex-initial px-2 text-sm font-bold text-warning">
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
          <div className="flex-1"></div>
          {!readOnly ? (
            <div className="hidden flex-initial space-x-2 sm:block">
              <Button
                variant="outline"
                icon={BracesIcon}
                label="Secrets"
                onClick={() => {
                  void router.push(`/w/${owner.sId}/developers/dev-secrets`);
                }}
              />
              <Button
                variant="ghost"
                icon={DocumentTextIcon}
                label="Documentation"
                onClick={() => {
                  window.open(
                    "https://docs.dust.tt/reference/introduction-to-dust-apps",
                    "_blank"
                  );
                }}
              />
            </div>
          ) : null}
          {!readOnly && run ? (
            <div className="hidden flex-initial sm:block">
              <ViewAppAPIModal
                disabled={readOnly || !(run?.status.run == "succeeded")}
                owner={owner}
                app={app}
                run={run}
              />
            </div>
          ) : null}
        </div>

        <SpecRunView
          owner={owner}
          app={app}
          readOnly={readOnly}
          isAdmin={isAdmin}
          showOutputs={!readOnly}
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
            <p className="mt-4">To get started, add your first block or:</p>
            <p className="mt-4">
              <Button
                variant="ghost"
                icon={DocumentTextIcon}
                label="Follow the QuickStart Guide"
                onClick={() => {
                  window.open(
                    "https://docs.dust.tt/reference/developer-platform-overview",
                    "_blank"
                  );
                }}
              />
            </p>
          </div>
        ) : null}

        {spec.length > 2 && !readOnly ? (
          <div className="my-4 flex flex-row items-center space-x-2">
            <div className="flex">
              <NewBlock
                disabled={readOnly}
                onClick={async (blockType) => {
                  await handleNewBlock(null, blockType);
                }}
                spec={spec}
                small={false}
              />
            </div>
            <div className="flex">
              {run?.status.run === "running" && showCancelButton ? (
                <Button
                  variant="outline"
                  disabled={cancelRequested}
                  label={cancelRequested ? "Canceling..." : "Cancel"}
                  onClick={() => handleCancelRun()}
                  icon={StopIcon}
                />
              ) : (
                <Button
                  variant="outline"
                  disabled={
                    !runnable || runRequested || run?.status.run == "running"
                  }
                  label={
                    runRequested || run?.status.run == "running"
                      ? "Running"
                      : "Run"
                  }
                  onClick={() => handleRun()}
                  icon={PlayIcon}
                />
              )}
            </div>
            {runError ? (
              <div className="flex px-2 text-sm font-bold text-warning">
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
      <div ref={bottomRef} className="mt-4"></div>
    </>
  );
}
