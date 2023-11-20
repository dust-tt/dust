import { Button, Tab } from "@dust-tt/sparkle";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  PlayCircleIcon,
} from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
// TODO: type sse.js or use something else
// @ts-expect-error there are no types for sse.js.
import { SSE } from "sse.js";

import { Execution } from "@app/components/app/blocks/Output";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  subNavigationAdmin,
  subNavigationApp,
} from "@app/components/sparkle/navigation";
import { Spinner } from "@app/components/Spinner";
import { getApp } from "@app/lib/api/app";
import { getDatasetHash } from "@app/lib/api/datasets";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { extractConfig } from "@app/lib/config";
import {
  checkDatasetData,
  getDatasetTypes,
  getValueType,
} from "@app/lib/datasets";
import { useSavedRunStatus } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { AppType, BlockRunConfig, SpecificationType } from "@app/types/app";
import { DatasetType } from "@app/types/dataset";
import { SubscriptionType } from "@app/types/plan";
import { TraceType } from "@app/types/run";
import { UserType, WorkspaceType } from "@app/types/user";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

const { GA_TRACKING_ID = "" } = process.env;

type Event = {
  content: {
    status: string;
  };
};

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  app: AppType;
  config: BlockRunConfig;
  inputDataset: DatasetType | null;
  readOnly: boolean;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !subscription) {
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

  const savedSpecification = JSON.parse(
    app.savedSpecification || "[]"
  ) as SpecificationType;
  const config = extractConfig(savedSpecification);
  const inputBlock = savedSpecification.find((block) => block.type === "input");

  let inputDataset = null;

  if (inputBlock) {
    const inputDatasetName = inputBlock.config.dataset;

    inputDataset = await getDatasetHash(auth, app, inputDatasetName, "latest");
    if (!inputDataset) {
      return {
        notFound: true,
      };
    }
  }

  return {
    props: {
      user,
      owner,
      subscription,
      app,
      config,
      inputDataset,
      readOnly,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

function getTraceFromEvents(data: unknown): TraceType[] {
  const events = Array.isArray(data) ? data : [data];

  let traces = events
    .map((o) => {
      const t = o?.content?.execution;
      if (t) {
        return t[0];
      }
      return null;
    })
    .filter((x) => x !== null);

  traces = traces.map((trace) =>
    Array.isArray(trace) && trace.length === 1 ? trace[0] : trace
  );

  if (traces.length === 1 && Array.isArray(traces[0])) {
    traces = traces[0];
  }

  traces = traces.filter((t) => t.value !== null || t.error !== null);

  return traces;
}

function ExecuteOutputLine({
  blockType,
  blockName,
  outputForBlock,
  lastEventForBlock,
  expanded,
  onToggleExpand,
}: {
  blockType: string;
  blockName: string;
  outputForBlock: unknown;
  lastEventForBlock: Event;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const traces = outputForBlock ? getTraceFromEvents(outputForBlock) : [];

  return (
    <div className="leading-none">
      <button
        disabled={!traces}
        onClick={() => onToggleExpand()}
        className={classNames("border-none", traces ? "" : "text-gray-400")}
      >
        <div className="flex flex-row items-center">
          {!expanded ? (
            <ChevronRightIcon className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-gray-400" />
          )}{" "}
          <div className="inline">
            <span className="rounded-md bg-gray-200 px-1 py-0.5 text-sm font-medium">
              {blockType}
            </span>
            <span className="ml-1 font-bold text-gray-700">{blockName}</span>
          </div>
          <div>
            {lastEventForBlock.content.status === "running" ? (
              <div className="ml-1">
                <Spinner />
              </div>
            ) : lastEventForBlock.content.status === "errored" ? (
              <ExclamationCircleIcon className="ml-1 h-4 w-4 text-red-500" />
            ) : null}
          </div>
        </div>
      </button>
      {expanded ? (
        <div className="mb-2 ml-8 flex text-sm text-gray-600">
          <Execution block={null} trace={traces} />
        </div>
      ) : null}
    </div>
  );
}

function ExecuteOutput({
  executionLogs,
  expandedByBlockTypeName,
  onToggleExpand,
}: {
  executionLogs: {
    blockOrder: { name: string; type: string }[];
    lastStatusEventByBlockTypeName: { [key: string]: Event | undefined };
    outputByBlockTypeName: { [key: string]: unknown };
  };
  expandedByBlockTypeName: { [key: string]: boolean };
  onToggleExpand: (blockTypeName: string) => void;
}) {
  return executionLogs.blockOrder.length ? (
    <>
      {executionLogs.blockOrder.map(({ name: blockName, type: blockType }) => {
        const blockTypeName = `${blockType}-${blockName}`;
        const lastEventForBlock =
          executionLogs.lastStatusEventByBlockTypeName[blockTypeName];
        const outputForBlock =
          executionLogs.outputByBlockTypeName[blockTypeName];
        if (!lastEventForBlock) {
          throw new Error(`No last event for block ${blockTypeName}`);
        }
        return (
          <ExecuteOutputLine
            key={blockTypeName}
            blockType={blockType}
            blockName={blockName}
            outputForBlock={outputForBlock}
            lastEventForBlock={lastEventForBlock}
            expanded={expandedByBlockTypeName[blockTypeName]}
            onToggleExpand={() => onToggleExpand(blockTypeName)}
          />
        );
      })}
    </>
  ) : null;
}

function ExecuteFinalOutput({
  value,
  errored,
}: {
  value: unknown;
  errored: boolean;
}) {
  let cleanedValue = value as any;
  if (Array.isArray(value) && value.length === 1) {
    cleanedValue = value[0];
  }

  if (cleanedValue && "value" in cleanedValue && cleanedValue.value) {
    cleanedValue = cleanedValue.value;
  } else if (cleanedValue && "error" in cleanedValue && cleanedValue.error) {
    cleanedValue = cleanedValue.error;
  }

  return (
    <div className="flex w-full">
      <div
        className={classNames(
          "flex-1 border bg-slate-100 px-0 py-0 text-[13px] leading-none",
          !errored ? "border-slate-100" : "border-red-500"
        )}
      >
        <TextareaAutosize
          minRows={1}
          className={classNames(
            "font-mono w-full resize-none border-0 bg-transparent px-1 py-0 text-[13px] font-normal ring-0 focus:ring-0",
            "text-gray-700"
          )}
          value={
            typeof cleanedValue === "string"
              ? cleanedValue
              : JSON.stringify(cleanedValue, null, 2)
          }
          readOnly={true}
        />
      </div>
    </div>
  );
}

function ExecuteInput({
  inputName,
  inputValue,
  onChange,
  inputType,
  onKeyDown,
}: {
  inputName: string;
  inputValue: string;
  onChange: (value: string) => void;
  inputType: string;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div key={inputName} className="grid grid-cols-10">
      <div className="col-span-3">
        <div className="group flex items-center bg-slate-300">
          <div
            className={classNames(
              "font-mono flex w-1/4 flex-1 border-0 bg-slate-300 px-1 py-1 text-[13px] font-normal outline-none focus:outline-none",
              "border-white ring-0 focus:border-white focus:ring-0"
            )}
            // readOnly={true}
            // value={inputName + " (" + inputType + ")"}
          >
            {inputName} (<span className="font-semibold">{inputType}</span>)
          </div>
        </div>
      </div>
      <div
        className={classNames(
          "font-mono col-span-7 inline-grid resize-none space-y-0 border bg-slate-100 px-0 py-0 text-[13px]",
          getValueType(inputValue) === inputType && inputValue?.length > 0
            ? "border-slate-100"
            : "border-red-500"
        )}
      >
        {inputType === "object" ? (
          <CodeEditor
            data-color-mode="light"
            value={
              typeof inputValue === "string"
                ? inputValue
                : JSON.stringify(inputValue, null, 2)
            }
            language="json"
            onChange={(e) => onChange(e.target.value)}
            padding={4}
            className="bg-slate-100"
            style={{
              fontSize: 13,
              fontFamily:
                "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
              backgroundColor: "rgb(241 245 249)",
            }}
            onKeyDown={onKeyDown}
          />
        ) : (
          <TextareaAutosize
            minRows={1}
            className={classNames(
              "font-mono w-full resize-none border-0 bg-transparent px-1 py-0 text-[13px] font-normal ring-0 focus:ring-0",
              "text-gray-700"
            )}
            value={inputValue || ""}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
        )}
      </div>
    </div>
  );
}

export default function ExecuteView({
  user,
  owner,
  subscription,
  app,
  config,
  inputDataset,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [inputDatasetKeys] = useState(
    inputDataset ? checkDatasetData({ data: inputDataset.data }) : []
  );
  const [datasetTypes] = useState(
    inputDatasetKeys.length
      ? getDatasetTypes(
          inputDatasetKeys,
          (inputDataset?.data || [{}])[0]
        ).reduce(
          (acc, curr, i) => ({ ...acc, [inputDatasetKeys[i]]: curr }),
          {} as { [key: string]: string }
        )
      : ({} as { [key: string]: string })
  );

  const [inputData, setInputData] = useState({} as { [key: string]: any });
  const isInputDataValid = () =>
    inputDatasetKeys.every(
      (k) =>
        (inputData[k] || "").length > 0 &&
        getValueType(inputData[k]) === datasetTypes[k]
    );

  const [isRunning, setIsRunning] = useState(false);
  const [isDoneRunning, setIsDoneRunning] = useState(false);
  const [isErrored, setIsErrored] = useState(false);

  const [finalOutputBlockTypeName, setFinalOutputBlockTypeName] = useState("");

  const [executionLogs, setExecutionLogs] = useState<{
    blockOrder: { type: string; name: string }[];
    lastStatusEventByBlockTypeName: { [key: string]: Event | undefined };
    outputByBlockTypeName: { [key: string]: Event[] | undefined };
  }>({
    blockOrder: [],
    lastStatusEventByBlockTypeName: {},
    outputByBlockTypeName: {},
  });

  const [outputExpandedByBlockTypeName, setOutputExpandedByBlockTypeName] =
    useState({});

  const { run: savedRun } = useSavedRunStatus(owner, app, (data) => {
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

  const canRun = () => !isRunning && isInputDataValid() && savedRun?.app_hash;

  useEffect(() => {
    if (isDoneRunning) {
      setIsRunning(false);
      const candidates = executionLogs.blockOrder.filter(
        // Don't treat reduce blocks as output as they don't have output
        ({ type: blockType }) => !["reduce", "end"].includes(blockType)
      );
      const lastBlock = candidates[candidates.length - 1];

      setFinalOutputBlockTypeName(`${lastBlock.type}-${lastBlock.name}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDoneRunning]);

  const handleValueChange = (k: string, value: string) => {
    const newInputData = { [k]: value };
    setInputData({ ...inputData, ...newInputData });
  };

  const handleRun = () => {
    setExecutionLogs({
      blockOrder: [],
      lastStatusEventByBlockTypeName: {},
      outputByBlockTypeName: {},
    });
    setIsRunning(true);
    setIsDoneRunning(false);
    setIsErrored(false);
    setFinalOutputBlockTypeName("");
    setOutputExpandedByBlockTypeName({});

    setTimeout(async () => {
      const specificationHash = savedRun?.app_hash;

      const requestBody = {
        specificationHash,
        config: JSON.stringify(config),
        inputs: [
          // Send inputs with their correct types
          Object.entries(inputData).reduce(
            (acc, [k, v]) => ({
              ...acc,
              [k]: datasetTypes[k] !== "string" ? JSON.parse(v) : v,
            }),
            {}
          ),
        ],
        mode: "execute",
      };

      const source = new SSE(`/api/w/${owner.sId}/apps/${app.sId}/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        payload: JSON.stringify(requestBody),
      });

      source.onerror = () => {
        setIsErrored(true);
        setIsRunning(false);
      };

      source.onmessage = (event: { data: string }) => {
        if (event.data === "") {
          console.error("Received empty event");
          // ignore empty events
          return;
        }

        const parsedEvent = JSON.parse(event.data);

        if (["block_status", "block_execution"].includes(parsedEvent.type)) {
          setExecutionLogs(
            ({
              blockOrder,
              lastStatusEventByBlockTypeName,
              outputByBlockTypeName,
            }) => {
              const blockType = parsedEvent.content.block_type;

              let blockName = parsedEvent.content.name;
              if (!blockName) {
                blockName = parsedEvent.content.block_name;
              }

              const blockTypeName = `${blockType}-${blockName}`;

              if (parsedEvent.type === "block_status") {
                if (
                  !blockOrder.find(
                    ({ name, type }) => name === blockName && type === blockType
                  )
                ) {
                  blockOrder.push({ name: blockName, type: blockType });
                }

                lastStatusEventByBlockTypeName[blockTypeName] = parsedEvent;

                if (parsedEvent.content.status === "errored") {
                  console.error("Block errored", parsedEvent);
                  setIsErrored(true);
                }
              } else {
                if (!outputByBlockTypeName[blockTypeName]) {
                  outputByBlockTypeName[blockTypeName] = [parsedEvent];
                } else {
                  outputByBlockTypeName[blockTypeName]?.push(parsedEvent);
                }
              }
              return {
                blockOrder,
                lastStatusEventByBlockTypeName,
                outputByBlockTypeName,
              };
            }
          );
        } else if (parsedEvent.type === "final") {
          setIsDoneRunning(true);
        }
      };

      source.stream();
    }, 0);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleKeyPress = (event: KeyboardEvent | React.KeyboardEvent) => {
    if (event.metaKey === true && event.key === "Enter" && canRun()) {
      handleRun();
      return false;
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress);

    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleKeyPress]);

  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({
        owner,
        current: "developers",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(`/w/${owner.sId}/a`);
          }}
        />
      }
      hideSidebar
    >
      <div className="flex w-full flex-col">
        <div className="mt-2 overflow-x-auto scrollbar-hide">
          <Tab tabs={subNavigationApp({ owner, app, current: "execute" })} />
        </div>
        <div className="mt-8 flex flex-col">
          <div className="mt-2 flex flex-col">
            <div className="mb-6 flex w-full flex-row">
              <div className="flex flex-initial items-center text-sm leading-snug text-gray-400">
                <div>
                  This panel lets you use your app on custom{" "}
                  <span className="rounded-md bg-gray-200 px-1 py-0.5 font-bold">
                    input
                  </span>{" "}
                  values once finalized.{" "}
                  {savedRun?.app_hash ? null : (
                    <>
                      You must run your app at least once from the Specification
                      panel to be able to execute it here with custom values.
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-1"></div>
              <div className="flex flex-initial">
                <div className="">
                  <Button
                    variant="primary"
                    disabled={!canRun()}
                    onClick={() => handleRun()}
                    icon={PlayCircleIcon}
                    label="Execute"
                  />
                </div>
              </div>
            </div>
            {inputDatasetKeys.length ? (
              <>
                <h3 className="text-sm font-medium text-gray-700">Input</h3>
                <p className="mt-2 text-sm text-gray-500">
                  The input fields are inferred from the Dataset attached to
                  your app's{" "}
                  <span className="rounded-md bg-gray-200 px-1 py-0.5 font-bold">
                    input
                  </span>{" "}
                  block.
                </p>
                <ul className="mb-6 mt-4 space-y-1">
                  {inputDatasetKeys.map((k) => (
                    <li key={k}>
                      <ExecuteInput
                        inputName={k}
                        inputValue={inputData[k]}
                        onChange={(value) => handleValueChange(k, value)}
                        inputType={datasetTypes[k]}
                        onKeyDown={handleKeyPress}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {executionLogs.blockOrder.length ? (
              <div className="">
                <h3 className="mb-3 text-sm font-medium text-gray-700">
                  Execution Trace
                </h3>
                <ExecuteOutput
                  executionLogs={executionLogs}
                  expandedByBlockTypeName={outputExpandedByBlockTypeName}
                  onToggleExpand={(blockName) => {
                    setOutputExpandedByBlockTypeName((prev) => {
                      const newExpanded: { [key: string]: boolean } = {
                        ...prev,
                      };
                      newExpanded[blockName] = !newExpanded[blockName];
                      return newExpanded;
                    });
                  }}
                />
              </div>
            ) : null}
            {finalOutputBlockTypeName && (
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-medium text-gray-700">
                  Output
                </h3>
                <ExecuteFinalOutput
                  value={getTraceFromEvents(
                    executionLogs.outputByBlockTypeName[
                      finalOutputBlockTypeName
                    ]
                  )}
                  errored={isErrored}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
