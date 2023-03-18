import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlayCircleIcon,
} from "@heroicons/react/20/solid";
import { unstable_getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { SSE } from "sse.js";
import {
  ArrayViewer,
  ObjectViewer,
  StringViewer,
} from "../../../../../components/app/blocks/Output";
import MainTab from "../../../../../components/app/MainTab";
import AppLayout from "../../../../../components/AppLayout";
import { ActionButton, Button } from "../../../../../components/Button";
import { extractConfig } from "../../../../../lib/config";
import { checkDatasetData } from "../../../../../lib/datasets";
import { classNames } from "../../../../../lib/utils";
import { useSavedRunStatus } from "../../../../../lib/swr";
import { Spinner } from "../../../../../components/Spinner";

const { URL, GA_TRACKING_ID = null } = process.env;

function preProcessOutput(output) {
  if (Array.isArray(output) && output.length === 1) {
    return preProcessOutput(output[0]);
  }
  if (output.value && output.error === null) {
    return preProcessOutput(output.value);
  }
  if (output.error) {
    return preProcessOutput(output.error);
  }
  if (output.completion?.text) {
    return output.completion.text;
  }
  return output;
}

function VerticalSpacer({ size = 1 }) {
  return <div className={`mb-${size}`} />;
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
      <Button disabled={!preprocessedOutput} onClick={() => onToggleExpand()}>
        <div className="flex flex-row items-center">
          {!expanded ? (
            <ChevronRightIcon className="h-4 w-4 mt-0.5" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 mt-0.5" />
          )}{" "}
          {blockName}{" "}
          {lastEventForBlock.content.status === "running" ? (
            <Spinner />
          ) : (
            <CheckCircleIcon className="text-emerald-300 h-4 w-4 min-w-4 mt-0.5" />
          )}
        </div>
      </Button>
      {expanded ? (
        <div className="flex ml-4">
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

function ExecuteInput({ inputName, inputValue, onChange }) {
  return (
    <div key={inputName} className="grid grid-cols-10">
      <div className="flex group items-center bg-slate-300">
        <input
          className={classNames(
            "px-1 py-1 font-normal text-[13px] font-mono bg-slate-300 border-0 outline-none focus:outline-none w-full",
            "border-white ring-0 focus:ring-0 focus:border-white"
          )}
          readOnly={true}
          value={inputName}
        />
      </div>
      <div
        className={classNames(
          "col-span-7 inline-grid space-y-0 resize-none text-[13px] font-mono px-0 py-0 border bg-slate-100",
          "border-slate-100"
        )}
      >
        <TextareaAutosize
          minRows={1}
          className={classNames(
            "w-full resize-none font-normal text-[13px] font-mono px-1 py-0 bg-transparent border-0 ring-0 focus:ring-0",
            "text-gray-700"
          )}
          value={inputValue || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export default function ExecuteView({
  app,
  user,
  ga_tracking_id,
  inputDataset,
  savedSpecification,
  config,
}) {
  const { data: session } = useSession();

  const [inputDatasetKeys, _setInputDatasetKeys] = useState(
    inputDataset ? checkDatasetData(inputDataset.dataset.data, false) : []
  );

  const [inputData, setInputData] = useState({});
  const isInputDataValid = () =>
    inputDatasetKeys.every((k) => (inputData[k] || "").length > 0);

  const [isRunning, setIsRunning] = useState(false);
  const [isRunComplete, setIsRunComplete] = useState(false);

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

  const expandLastBlockOutput = () => {
    const lastBlockName =
      executionLogs.blockOrder[executionLogs.blockOrder.length - 1];
    setOutputExpandedByBlockName({
      ...outputExpandedByBlockName,
      [lastBlockName]: true,
    });
  };

  useEffect(() => {
    if (isRunComplete) {
      expandLastBlockOutput();
    }
  }, [isRunComplete]);

  const handleValueChange = (k, value) => {
    const newInputData = { [k]: value };
    setInputData({ ...inputData, ...newInputData });
  };

  const handleRun = () => {
    setExecutionLogs({
      blockOrder: [],
      lastEventByBlockName: {},
      outputByBlockName: {},
    });
    setIsRunning(true);
    setIsRunComplete(false);
    setOutputExpandedByBlockName({});

    setTimeout(async () => {
      const specificationHash = savedRun?.app_hash;

      const requestBody = {
        specification: specificationHash
          ? null
          : JSON.stringify(savedSpecification),
        specificationHash,
        config: JSON.stringify(config),
        inputs: [inputData],
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
      source.onmessage = (event) => {
        const parsedEvent = JSON.parse(event.data);

        if (["block_status", "block_execution"].includes(parsedEvent.type)) {
          setExecutionLogs(
            ({ blockOrder, lastEventByBlockName, outputByBlockName }) => {
              let blockName = parsedEvent.content.name;
              if (!blockName) {
                blockName = parsedEvent.content.block_name;
              }
              if (parsedEvent.type === "block_status") {
                if (blockOrder[blockOrder.length - 1] !== blockName) {
                  blockOrder.push(blockName);
                }
                lastEventByBlockName[blockName] = parsedEvent;
              } else {
                outputByBlockName[blockName] = parsedEvent;
              }
              return {
                blockOrder,
                lastEventByBlockName,
                outputByBlockName,
              };
            }
          );
        } else if (parsedEvent.type === "final") {
          setIsRunning(false);
          setIsRunComplete(true);
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
            <ul className="space-y-2">
              {inputDatasetKeys.map((k) => (
                <li key={k} className="space-y-[1px]">
                  <ExecuteInput
                    inputName={k}
                    inputValue={inputData[k]}
                    onChange={(value) => handleValueChange(k, value)}
                  />
                </li>
              ))}
            </ul>

            {executionLogs.blockOrder.length ? (
              <>
                <VerticalSpacer size={4} />
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
            <VerticalSpacer size={4} />
            <div className="static inset-auto static inset-auto right-0 hidden sm:flex flex-initial items-center pr-2 sm:pr-0">
              <div className="mt-100">
                <ActionButton
                  disabled={isRunning || !isInputDataValid()}
                  onClick={() => handleRun()}
                >
                  <PlayCircleIcon className="-ml-1 mr-1 h-5 w-5 mt-0.5" />
                  Run
                </ActionButton>
              </div>
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
      savedSpecification,
      config,
      inputDataset: inputDataset,
    },
  };
}
