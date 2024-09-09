import {
  Button,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  PlayIcon,
  Tab,
} from "@dust-tt/sparkle";
import type {
  APIErrorResponse,
  AppType,
  BlockRunConfig,
  BlockType,
  CoreAPIError,
  SpecificationBlockType,
  SpecificationType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useRef, useState } from "react";
import { useSWRConfig } from "swr";

import Deploy from "@app/components/app/Deploy";
import NewBlock from "@app/components/app/NewBlock";
import SpecRunView from "@app/components/app/SpecRunView";
import {
  subNavigationApp,
  subNavigationBuild,
} from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import config from "@app/lib/api/config";
import { extractConfig } from "@app/lib/config";
import { withDefaultUserAuthRequirementsNoWorkspaceCheck } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import {
  addBlock,
  deleteBlock,
  moveBlockDown,
  moveBlockUp,
} from "@app/lib/specification";
import { useSavedRunStatus } from "@app/lib/swr/apps";
import { getDustAppsListUrl } from "@app/lib/vault_rollout";

export const getServerSideProps =
  withDefaultUserAuthRequirementsNoWorkspaceCheck<{
    user: UserType | null;
    owner: WorkspaceType;
    subscription: SubscriptionType;
    readOnly: boolean;
    url: string;
    dustAppsListUrl: string;
    app: AppType;
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

    const app = await AppResource.fetchById(
      auth,
      context.params?.aId as string
    );

    if (!app) {
      return {
        notFound: true,
      };
    }

    const dustAppsListUrl = await getDustAppsListUrl(auth);

    return {
      props: {
        user: auth.user(),
        owner,
        subscription,
        readOnly,
        url: config.getClientFacingUrl(),
        dustAppsListUrl,
        app: app.toJSON(),
        gaTrackingId: config.getGaTrackingId(),
      },
    };
  });

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
        key != "function_call"
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
  subscription,
  readOnly,
  app,
  url,
  dustAppsListUrl,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { mutate } = useSWRConfig();

  const [spec, setSpec] = useState(
    JSON.parse(app.savedSpecification || `[]`) as SpecificationType
  );

  const [config, setConfig] = useState(
    extractConfig(JSON.parse(app.savedSpecification || `{}`))
  );
  const [runnable, setRunnable] = useState(isRunnable(readOnly, spec, config));
  const [runRequested, setRunRequested] = useState(false);
  const [runError, setRunError] = useState(null as null | CoreAPIError);

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

  const saveState = async (spec: SpecificationType, config: BlockRunConfig) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    saveTimeout = setTimeout(async () => {
      if (!readOnly) {
        await fetch(`/api/w/${owner.sId}/apps/${app.sId}/state`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            specification: JSON.stringify(spec),
            config: JSON.stringify(config),
          }),
        });

        console.log("STATE SAVED", spec, config);
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
          }),
        }),
      ]);

      if (!runRes.ok) {
        const r: APIErrorResponse = await runRes.json();
        setRunError(r.error.run_error as CoreAPIError);
      } else {
        setRunError(null);
        const [run] = await Promise.all([runRes.json()]);

        // Mutate the run status to trigger a refresh of `useSavedRunStatus`.
        await mutate(`/api/w/${owner.sId}/apps/${app.sId}/runs/saved/status`);

        // Mutate all blocks to trigger a refresh of `useRunBlock` in each block `Output`.
        await Promise.all(
          spec.map(async (block) => {
            return mutate(
              `/api/w/${owner.sId}/apps/${app.sId}/runs/${run.run.run_id}/blocks/${block.type}/${block.name}`
            );
          })
        );
      }
    }, 0);
  };

  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      hideSidebar
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
    >
      <div className="flex w-full flex-col">
        <Tab
          className="mt-2"
          tabs={subNavigationApp({ owner, app, current: "specification" })}
        />
        <div className="mt-8 flex flex-auto flex-col">
          <div className="mb-4 flex flex-row items-center space-x-2">
            <NewBlock
              disabled={readOnly}
              onClick={async (blockType) => {
                await handleNewBlock(null, blockType);
              }}
              spec={spec}
              direction="down"
              small={false}
            />
            <Button
              variant="secondary"
              disabled={
                !runnable || runRequested || run?.status.run == "running"
              }
              label={
                runRequested || run?.status.run == "running" ? "Running" : "Run"
              }
              onClick={() => handleRun()}
              icon={PlayIcon}
            />
            {runError ? (
              <div className="flex-initial px-2 text-sm font-bold text-red-400">
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
                <Button
                  variant="secondary"
                  label="Clone"
                  icon={DocumentDuplicateIcon}
                  onClick={() => {
                    void router.push(
                      `/w/${owner.sId}/vaults/${app.vault.sId}/apps/${app.sId}/clone`
                    );
                  }}
                />
              </div>
            ) : null}
            <div className="flex-1"></div>
            {!readOnly ? (
              <div className="hidden flex-initial sm:block">
                <Button
                  variant="tertiary"
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
                  variant="tertiary"
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
                  direction="up"
                  small={false}
                />
              </div>
              <div className="flex">
                <Button
                  variant="secondary"
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
              </div>
              {runError ? (
                <div className="flex px-2 text-sm font-bold text-red-400">
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
      </div>
    </AppLayout>
  );
}
