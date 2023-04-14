import MainTab from "@app/components/app/MainTab";
import AppLayout from "@app/components/AppLayout";
import { ActionButton } from "@app/components/Button";
import { Spinner } from "@app/components/Spinner";
import { extractConfig } from "@app/lib/config";
import {
  checkDatasetData,
  getDatasetTypes,
  getValueType,
} from "@app/lib/datasets";
import { useSavedRunStatus } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import {
  ExclamationCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlayCircleIcon,
} from "@heroicons/react/20/solid";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { SSE } from "sse.js";
import { auth_user } from "@app/lib/auth";
import { Execution } from "@app/components/app/blocks/Output";

const { URL, GA_TRACKING_ID = null } = process.env;

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

function getTraceFromEvents(data) {
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

  if (traces.length === 0) {
    return null;
  }

  return traces;
}

function ExecuteOutputLine({
  blockType,
  blockName,
  outputForBlock,
  lastEventForBlock,
  expanded,
  onToggleExpand,
}) {
  let traces = outputForBlock ? getTraceFromEvents(outputForBlock) : null;

  return (
    <div className="leading-none">
      <button
        disabled={!traces}
        onClick={() => onToggleExpand()}
        className={classNames("border-none", traces ? null : "text-gray-400")}
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
        <div className="ml-8 mb-2 flex text-sm text-gray-600">
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
}) {
  return executionLogs.blockOrder.length ? (
    <>
      {executionLogs.blockOrder.map(({ name: blockName, type: blockType }) => {
        const blockTypeName = `${blockType}-${blockName}`;
        const lastEventForBlock =
          executionLogs.lastEventByBlockTypeName[blockTypeName];
        const outputForBlock =
          executionLogs.outputByBlockTypeName[blockTypeName];
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

function ExecuteFinalOutput({ value, errored }) {
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
            "w-full resize-none border-0 bg-transparent px-1 py-0 font-mono text-[13px] font-normal ring-0 focus:ring-0",
            "text-gray-700"
          )}
          value={
            typeof value === "string" ? value : JSON.stringify(value, null, 2)
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
}) {
  return (
    <div key={inputName} className="grid grid-cols-10">
      <div className="col-span-3">
        <div className="group flex items-center bg-slate-300">
          <div
            className={classNames(
              "flex w-1/4 flex-1 border-0 bg-slate-300 px-1 py-1 font-mono text-[13px] font-normal outline-none focus:outline-none",
              "border-white ring-0 focus:border-white focus:ring-0"
            )}
            readOnly={true}
            value={inputName + " (" + inputType + ")"}
          >
            {inputName} (<span className="font-semibold">{inputType}</span>)
          </div>
        </div>
      </div>
      <div
        className={classNames(
          "col-span-7 inline-grid resize-none space-y-0 border bg-slate-100 px-0 py-0 font-mono text-[13px]",
          getValueType(inputValue) === inputType && inputValue?.length > 0
            ? "border-slate-100"
            : "border-red-500"
        )}
      >
        {inputType === "object" ? (
          <CodeEditor
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
              "w-full resize-none border-0 bg-transparent px-1 py-0 font-mono text-[13px] font-normal ring-0 focus:ring-0",
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
  authUser,
  owner,
  app,
  inputDataset,
  config,
  ga_tracking_id,
  readOnly,
}) {
  const [inputDatasetKeys, _setInputDatasetKeys] = useState(
    inputDataset ? checkDatasetData(inputDataset.dataset.data) : []
  );
  const [datasetTypes, _setDatasetTypes] = useState(
    inputDatasetKeys.length
      ? getDatasetTypes(inputDatasetKeys, inputDataset.dataset.data[0]).reduce(
          (acc, curr, i) => ({ ...acc, [inputDatasetKeys[i]]: curr }),
          {}
        )
      : {}
  );

  const [inputData, setInputData] = useState({});
  const isInputDataValid = () =>
    inputDatasetKeys.every(
      (k) =>
        (inputData[k] || "").length > 0 &&
        getValueType(inputData[k]) === datasetTypes[k]
    );

  const [isRunning, setIsRunning] = useState(false);
  const [isDoneRunning, setIsDoneRunning] = useState(false);
  const [isErrored, setIsErrored] = useState(false);

  const [finalOutputBlockTypeName, setFinalOutputBlockTypeName] =
    useState(null);

  const [executionLogs, setExecutionLogs] = useState({
    blockOrder: [],
    lastEventByBlockTypeName: {},
    outputByBlockTypeName: {},
  });

  const [outputExpandedByBlockTypeName, setOutputExpandedByBlockTypeName] =
    useState({});

  const {
    run: savedRun,
    _isRunLoading,
    _isRunError,
  } = useSavedRunStatus(owner.username, app, (data) => {
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
  }, [isDoneRunning]);

  const handleValueChange = (k, value) => {
    const newInputData = { [k]: value };
    setInputData({ ...inputData, ...newInputData });
  };

  const handleRun = () => {
    setExecutionLogs({
      blockOrder: [],
      lastEventByBlockTypeName: {},
      outputByBlockTypeName: {},
    });
    setIsRunning(true);
    setIsDoneRunning(false);
    setIsErrored(false);
    setFinalOutputBlockTypeName(null);
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

      const source = new SSE(`/api/apps/${owner.username}/${app.sId}/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        payload: JSON.stringify(requestBody),
      });

      source.onerror = (_event) => {
        setIsErrored(true);
        setIsRunning(false);
      };

      source.onmessage = (event) => {
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
              lastEventByBlockTypeName,
              outputByBlockTypeName,
            }) => {
              const blockType = parsedEvent.content.block_type;

              let blockName = parsedEvent.content.name;
              if (!blockName) {
                blockName = parsedEvent.content.block_name;
              }

              const blockTypeName = `${blockType}-${blockName}`;

              if (parsedEvent.type === "block_status") {
                const existingBlock = blockOrder.find(
                  ({ name, type }) => name === blockName && type === blockType
                );
                if (!existingBlock) {
                  blockOrder.push({ name: blockName, type: blockType });
                }
                lastEventByBlockTypeName[blockTypeName] = parsedEvent;

                if (parsedEvent.content.status === "errored") {
                  console.error("Block errored", parsedEvent);
                  setIsErrored(true);
                }
              } else {
                if (outputByBlockTypeName[blockTypeName]) {
                  if (!Array.isArray(outputByBlockTypeName[blockTypeName])) {
                    const existingOutput = outputByBlockTypeName[blockTypeName];
                    outputByBlockTypeName[blockTypeName] = [existingOutput];
                  }
                } else {
                  outputByBlockTypeName[blockTypeName] = [];
                }
                outputByBlockTypeName[blockTypeName].push(parsedEvent);
              }
              return {
                blockOrder,
                lastEventByBlockTypeName,
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

  const handleKeyPress = (event) => {
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

  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
      ga_tracking_id={ga_tracking_id}
    >
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Use"
            owner={owner}
            authUser={authUser}
            readOnly={readOnly}
          />
        </div>
        <div className="mx-auto mt-6 w-full max-w-5xl">
          <div className="mx-8 max-w-4xl"></div>
          <div className="mx-8 mt-2 flex flex-col">
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
                  <ActionButton
                    disabled={!canRun()}
                    onClick={() => handleRun()}
                  >
                    <PlayCircleIcon className="-ml-1 mr-1 mt-0.5 h-5 w-5" />
                    Execute
                  </ActionButton>
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
                <ul className="mt-4 mb-6 space-y-1">
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
                      const newExpanded = { ...prev };
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

export async function getServerSideProps(context) {
  let authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return { noFound: true };
  }
  let auth = authRes.value;

  if (auth.isAnonymous()) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  let readOnly =
    auth.isAnonymous() || context.query.user !== auth.user().username;

  const appRes = await fetch(
    `${URL}/api/apps/${context.query.user}/${context.query.sId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }
  );

  if (appRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const app = await appRes.json();
  if (!auth.canReadApp(app.app)) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  const savedSpecification = JSON.parse(app.app.savedSpecification || "[]");
  const config = extractConfig(savedSpecification);
  const inputBlock = savedSpecification.find((block) => block.type === "input");

  let inputDataset = null;

  if (inputBlock) {
    const inputDatasetName = inputBlock.config.dataset;

    const inputDatasetRes = await fetch(
      `${URL}/api/apps/${context.query.user}/${context.query.sId}/datasets/${inputDatasetName}/latest`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: context.req.headers.cookie,
        },
      }
    );
    inputDataset = await inputDatasetRes.json();
  }

  return {
    props: {
      session: auth.session(),
      authUser: auth.user(),
      owner: { username: context.query.user },
      app: app.app,
      config,
      inputDataset: inputDataset,
      ga_tracking_id: GA_TRACKING_ID,
      readOnly,
    },
  };
}
