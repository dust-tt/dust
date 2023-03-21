import {
  ArrayViewer,
  ObjectViewer,
  StringViewer,
} from "@app/components/app/blocks/Output";
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
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlayCircleIcon,
} from "@heroicons/react/20/solid";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { SSE } from "sse.js";

const { URL, GA_TRACKING_ID = null } = process.env;

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

function preProcessOutput(output) {
  if (Array.isArray(output) && output.length === 1) {
    return preProcessOutput(output[0]);
  }
  if (Array.isArray(output)) {
    return output.map(preProcessOutput);
  }
  if (output.value && output.error === null) {
    return preProcessOutput(output.value);
  }
  if (output.error) {
    return preProcessOutput(output.error);
  }
  if (
    Object.keys(output).length === 2 &&
    output.value === null &&
    output.error === null
  ) {
    return null;
  }

  return output;
}

function ExecuteOutputLine({
  blockName,
  outputForBlock,
  lastEventForBlock,
  expanded,
  onToggleExpand,
}) {
  let preprocessedOutput = outputForBlock
    ? preProcessOutput(outputForBlock.content.execution[0])
    : null;

  return (
    <>
      <button
        disabled={!preprocessedOutput}
        onClick={() => onToggleExpand()}
        className={classNames(
          "border-none",
          preprocessedOutput ? null : "text-gray-400"
        )}
      >
        <div className="flex flex-row items-center">
          {lastEventForBlock.content.status === "running" ? (
            <div className="mr-1">
              <Spinner />
            </div>
          ) : (
            <CheckCircleIcon className="text-emerald-300 h-4 w-4 min-w-4 mt-0.5" />
          )}
          {!expanded ? (
            <ChevronRightIcon className="h-4 w-4 mt-0.5" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 mt-0.5" />
          )}{" "}
          {blockName}{" "}
        </div>
      </button>
      {expanded ? (
        <div className="flex ml-4 text-sm text-gray-600">
          {Array.isArray(preprocessedOutput) ? (
            <ArrayViewer value={preprocessedOutput} />
          ) : typeof preprocessedOutput == "string" ? (
            <StringViewer value={preprocessedOutput} />
          ) : typeof outputForBlock.content.execution == "object" ? (
            <ObjectViewer value={preprocessedOutput} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function ExecuteOutput({ executionLogs, expandedByBlockName, onToggleExpand }) {
  return executionLogs.blockOrder.length ? (
    <>
      {executionLogs.blockOrder.map((blockName, index) => {
        const lastEventForBlock = executionLogs.lastEventByBlockName[blockName];
        const outputForBlock = executionLogs.outputByBlockName[blockName];
        return (
          <ExecuteOutputLine
            key={blockName}
            blockName={blockName}
            outputForBlock={outputForBlock}
            lastEventForBlock={lastEventForBlock}
            expanded={expandedByBlockName[blockName]}
            onToggleExpand={() => onToggleExpand(blockName)}
          />
        );
      })}
    </>
  ) : null;
}

function ExecuteFinalOutput({ value, errored }) {
  return (
    <div className="grid grid-cols-15">
      <div
        className={classNames(
          "col-span-7 inline-grid space-y-0 resize-none text-[13px] font-mono px-0 py-0 border bg-slate-100",
          !errored ? "border-slate-100" : "border-red-500"
        )}
      >
        <TextareaAutosize
          minRows={1}
          className={classNames(
            "w-full resize-none font-normal text-[13px] font-mono px-1 py-0 bg-transparent border-0 ring-0 focus:ring-0",
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

function ExecuteInput({ inputName, inputValue, onChange, inputType }) {
  return (
    <div key={inputName} className="flex">
      <input
        className={classNames(
          "px-1 py-1 font-normal text-[13px] font-mono bg-slate-300 border-0 outline-none focus:outline-none w-1/4",
          "border-white ring-0 focus:ring-0 focus:border-white"
        )}
        readOnly={true}
        value={inputName}
      />
      <div
        className={classNames(
          "col-span-7 inline-grid space-y-0 resize-none text-[13px] font-mono px-0 py-0 border bg-slate-100 w-3/4",
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
          />
        ) : (
          <TextareaAutosize
            minRows={1}
            className={classNames(
              "w-full resize-none font-normal text-[13px] font-mono px-1 py-0 bg-transparent border-0 ring-0 focus:ring-0",
              "text-gray-700"
            )}
            value={inputValue || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

export default function ExecuteView({
  app,
  user,
  ga_tracking_id,
  inputDataset,
  config,
}) {
  const { data: session } = useSession();

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

  const [finalOutputBlockName, setFinalOutputBlockName] = useState(null);

  const [executionLogs, setExecutionLogs] = useState({
    blockOrder: [],
    lastEventByBlockName: {},
    outputByBlockName: {},
  });

  const [outputExpandedByBlockName, setOutputExpandedByBlockName] = useState(
    {}
  );

  const {
    run: savedRun,
    _isRunLoading,
    _isRunError,
  } = useSavedRunStatus(user, app, (data) => {
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

  useEffect(() => {
    if (isDoneRunning) {
      setIsRunning(false);
      const candidates = executionLogs.blockOrder.filter(
        // Don't treat reduce blocks as output as they don't have output
        (blockName) => executionLogs.blockTypeByName[blockName] !== "reduce"
      );
      const lastBlockName = candidates[candidates.length - 1];

      setFinalOutputBlockName(lastBlockName);
    }
  }, [isDoneRunning]);

  const handleValueChange = (k, value) => {
    const newInputData = { [k]: value };
    setInputData({ ...inputData, ...newInputData });
  };

  const handleRun = () => {
    setExecutionLogs({
      blockOrder: [],
      lastEventByBlockName: {},
      outputByBlockName: {},
      blockTypeByName: {},
    });
    setIsRunning(true);
    setIsDoneRunning(false);
    setIsErrored(false);
    setFinalOutputBlockName(null);
    setOutputExpandedByBlockName({});

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

      const source = new SSE(
        `/api/apps/${session.user.username}/${app.sId}/runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          payload: JSON.stringify(requestBody),
        }
      );

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
              lastEventByBlockName,
              outputByBlockName,
              blockTypeByName,
            }) => {
              const blockType = parsedEvent.content.block_type;

              let blockName = parsedEvent.content.name;
              if (!blockName) {
                blockName = parsedEvent.content.block_name;
              }
              if (["map", "reduce"].includes(blockType)) {
                blockName = `${blockName}[${blockType}]`;
              }

              if (parsedEvent.type === "block_status") {
                if (blockOrder[blockOrder.length - 1] !== blockName) {
                  blockOrder.push(blockName);
                }
                lastEventByBlockName[blockName] = parsedEvent;
                blockTypeByName[blockName] = blockType;
                if (parsedEvent.content.status === "errored") {
                  console.error("Block errored", parsedEvent);
                  setIsErrored(true);
                }
              } else {
                outputByBlockName[blockName] = parsedEvent;
              }
              return {
                blockOrder,
                lastEventByBlockName,
                outputByBlockName,
                blockTypeByName,
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

  return (
    <AppLayout
      app={{ sId: app.sId, name: app.name, description: app.description }}
      ga_tracking_id={ga_tracking_id}
    >
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            currentTab="Run"
            user={user}
          />
        </div>
        <div className="w-full max-w-5xl mt-4 mx-auto">
          <div className="flex flex-auto flex-col mx-2 sm:mx-4 lg:mx-8">
            {inputDatasetKeys.length ? (
              <div className="font-bold text-gray-700 pr-2 mb-2">Input:</div>
            ) : null}
            <ul className="space-y-2">
              {inputDatasetKeys.map((k) => (
                <li key={k} className="space-y-[1px]">
                  <ExecuteInput
                    inputName={k}
                    inputValue={inputData[k]}
                    onChange={(value) => handleValueChange(k, value)}
                    inputType={datasetTypes[k]}
                  />
                </li>
              ))}
            </ul>
            {executionLogs.blockOrder.length ? (
              <>
                <div className="font-bold text-gray-700 pr-2 mb-2 mt-4">
                  Progress:
                </div>
                <ExecuteOutput
                  executionLogs={executionLogs}
                  expandedByBlockName={outputExpandedByBlockName}
                  onToggleExpand={(blockName) => {
                    setOutputExpandedByBlockName((prev) => {
                      const newExpanded = { ...prev };
                      newExpanded[blockName] = !newExpanded[blockName];
                      return newExpanded;
                    });
                  }}
                />
              </>
            ) : null}
            {finalOutputBlockName && (
              <div className="mt-4">
                <div className="font-bold text-gray-700 pr-2 mb-2">Output:</div>
                <ExecuteFinalOutput
                  value={preProcessOutput(
                    executionLogs.outputByBlockName[finalOutputBlockName]
                      .content.execution[0]
                  )}
                  errored={isErrored}
                />
              </div>
            )}
            <div className="static inset-auto static inset-auto right-0 hidden sm:flex flex-initial items-center pr-2 sm:pr-0 mt-4">
              <ActionButton
                disabled={
                  isRunning || !isInputDataValid() || !savedRun?.app_hash
                }
                onClick={() => handleRun()}
              >
                <PlayCircleIcon className="-ml-1 mr-1 h-5 w-5 mt-0.5" />
                Run
              </ActionButton>
            </div>
            <div className="text-sm text-gray-400 mt-1 mb-1">
              {savedRun?.app_hash
                ? `App hash: ${savedRun?.app_hash.slice(0, 7)}`
                : "Please run the app from the specification tab first"}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export async function getServerSideProps(context) {
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
      app: app.app,
      user: context.query.user,
      ga_tracking_id: GA_TRACKING_ID,
      config,
      inputDataset: inputDataset,
    },
  };
}
