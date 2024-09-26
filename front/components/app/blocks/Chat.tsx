import "@uiw/react-textarea-code-editor/dist.css";

import { ChevronDownIcon, ChevronRightIcon, XMarkIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { SpecificationBlockType, SpecificationType } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { BlockType } from "@dust-tt/types";
import type { RunType } from "@dust-tt/types";
import dynamic from "next/dynamic";
import { useState } from "react";

import ModelPicker from "@app/components/app/ModelPicker";
import { classNames, shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function Chat({
  owner,
  app,
  spec,
  run,
  block,
  status,
  running,
  readOnly,
  isAdmin,
  showOutputs,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
  onBlockNew,
}: React.PropsWithChildren<{
  owner: WorkspaceType;
  app: AppType;
  spec: SpecificationType;
  run: RunType | null;
  block: SpecificationBlockType;
  status: any;
  running: boolean;
  readOnly: boolean;
  isAdmin: boolean;
  showOutputs: boolean;
  onBlockUpdate: (block: SpecificationBlockType) => void;
  onBlockDelete: () => void;
  onBlockUp: () => void;
  onBlockDown: () => void;
  onBlockNew: (blockType: BlockType | "map_reduce" | "while_end") => void;
}>) {
  const handleModelChange = (model: {
    provider_id: string;
    model_id: string;
  }) => {
    const b = shallowBlockClone(block);
    b.config.provider_id = model.provider_id;
    b.config.model_id = model.model_id;
    onBlockUpdate(b);
  };

  const handleTemperatureChange = (temperature: string) => {
    const b = shallowBlockClone(block);
    b.spec.temperature = temperature;
    onBlockUpdate(b);
  };

  const handleMaxTokensChange = (max_tokens: string) => {
    const b = shallowBlockClone(block);
    b.spec.max_tokens = max_tokens;
    onBlockUpdate(b);
  };

  const handleAddStop = (stop: string) => {
    const b = shallowBlockClone(block);
    b.spec.stop.push(stop);
    onBlockUpdate(b);
    setNewStop("");
  };

  const handleRemoveStop = (index?: number) => {
    const b = shallowBlockClone(block);
    if (typeof index === "number") {
      if (index >= 0 && index < b.spec.stop.length) {
        b.spec.stop.splice(index, 1);
      }
    } else if (b.spec.stop.length > 0) {
      b.spec.stop.pop();
    }
    onBlockUpdate(b);
  };

  const handlePresencePenaltyChange = (presence_penalty: string) => {
    const b = shallowBlockClone(block);
    b.spec.presence_penalty = presence_penalty;
    onBlockUpdate(b);
  };

  const handleFrequencyPenaltyChange = (frequency_penalty: string) => {
    const b = shallowBlockClone(block);
    b.spec.frequency_penalty = frequency_penalty;
    onBlockUpdate(b);
  };

  const handleTopPChange = (top_p: string) => {
    const b = shallowBlockClone(block);
    b.spec.top_p = top_p;
    onBlockUpdate(b);
  };

  const handleInstructionsChange = (instructions: string) => {
    const b = shallowBlockClone(block);
    b.spec.instructions = instructions;
    onBlockUpdate(b);
  };

  const handleMessagesCodeChange = (messagesCode: string) => {
    const b = shallowBlockClone(block);
    b.spec.messages_code = messagesCode;
    onBlockUpdate(b);
  };

  const handleFunctionsCodeChange = (functionsCode: string) => {
    const b = shallowBlockClone(block);
    b.spec.functions_code = functionsCode;
    onBlockUpdate(b);
  };

  const handleFunctionCallChange = (function_call: string) => {
    const b = shallowBlockClone(block);
    b.config.function_call = function_call;
    onBlockUpdate(b);
  };

  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [functionsExpanded, setFunctionsExpanded] = useState(false);
  const [newStop, setNewStop] = useState("");

  const config =
    (block.config as {
      provider_id: string;
      model_id: string;
      temperature?: number;
    }) || null;
  let temperature = block.spec.temperature;
  if (typeof block.config.temperature === "number") {
    temperature = block.config.temperature.toString();
  }

  return (
    <Block
      owner={owner}
      app={app}
      spec={spec}
      run={run}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
      showOutputs={showOutputs}
      canUseCache={true}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="mx-4 flex w-full flex-col">
        <div className="flex flex-col xl:flex-row xl:space-x-2">
          <div className="mr-2 flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="mr-1 flex flex-initial">model:</div>
            <ModelPicker
              owner={owner}
              readOnly={readOnly}
              isAdmin={isAdmin}
              model={
                config
                  ? {
                      provider_id: block.config.provider_id,
                      model_id: block.config.model_id,
                    }
                  : { provider_id: "", model_id: "" }
              }
              onModelUpdate={(model) => {
                handleModelChange(model);
              }}
              chatOnly={true}
            />
          </div>
          <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="flex flex-initial">temperature:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block w-8 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                  readOnly
                    ? "border-white ring-0 focus:border-white focus:ring-0"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                readOnly={readOnly}
                value={temperature}
                onChange={(e) => handleTemperatureChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="flex flex-initial">max tokens:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block w-12 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                  readOnly
                    ? "border-white ring-0 focus:border-white focus:ring-0"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                spellCheck={false}
                readOnly={readOnly}
                value={block.spec.max_tokens || ""}
                onChange={(e) => handleMaxTokensChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="flex flex-initial">stop:</div>
            <div className="flex w-full font-normal">
              <div
                className={classNames(
                  "flex flex-row items-center text-sm font-normal"
                )}
              >
                <div className="flex flex-row items-center space-x-1">
                  {(block.spec.stop || ([] as string[])).map(
                    (stop: string, i: number) => (
                      <div
                        key={i}
                        className="flex rounded-md bg-slate-100 px-1"
                      >
                        {stop}
                        <span
                          onClick={() => handleRemoveStop(i)}
                          className="ml-1 flex cursor-pointer items-center"
                        >
                          <XMarkIcon />
                        </span>
                      </div>
                    )
                  )}
                </div>
                {readOnly ? null : (
                  <input
                    type="text"
                    placeholder="add stop"
                    value={newStop}
                    onChange={(e) => setNewStop(e.target.value)}
                    className={classNames(
                      "ml-1 flex w-20 flex-1 rounded-md px-1 py-1 text-sm font-normal ring-0",
                      "placeholder-gray-300",
                      readOnly
                        ? "border-white ring-0 focus:border-white focus:ring-0"
                        : "border-gray-300 focus:border-gray-300 focus:border-gray-500 focus:ring-0"
                    )}
                    readOnly={readOnly}
                    onBlur={(e) => {
                      if (e.target.value.trim().length > 0) {
                        handleAddStop(e.target.value);
                        e.preventDefault();
                      }
                    }}
                    onKeyDown={(e) => {
                      const stop = e.currentTarget.value;
                      if (
                        (e.key === "Tab" || e.key == "Enter") &&
                        stop.trim().length > 0
                      ) {
                        handleAddStop(stop);
                        e.preventDefault();
                      }
                      if (e.key === "Backspace" && newStop.length === 0) {
                        handleRemoveStop();
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col text-sm font-medium leading-8 text-gray-500">
          {advancedExpanded ? (
            <div
              onClick={() => setAdvancedExpanded(false)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronDownIcon className="mr-1 mt-0.5 h-4 w-4" />
              </span>
              advanced
            </div>
          ) : (
            <div
              onClick={() => setAdvancedExpanded(true)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronRightIcon className="mr-1 mt-0.5 h-4 w-4" />
              </span>
              advanced
            </div>
          )}
          {advancedExpanded ? (
            <div className="flex flex-col xl:flex-row xl:space-x-2">
              <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                <div className="flex flex-initial">frequency_penalty:</div>
                <div className="flex flex-initial font-normal">
                  <input
                    type="text"
                    className={classNames(
                      "block w-8 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                      readOnly
                        ? "border-white ring-0 focus:border-white focus:ring-0"
                        : "border-white focus:border-gray-300 focus:ring-0"
                    )}
                    spellCheck={false}
                    readOnly={readOnly}
                    value={block.spec.frequency_penalty}
                    onChange={(e) =>
                      handleFrequencyPenaltyChange(e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                <div className="flex flex-initial">presence_penalty:</div>
                <div className="flex flex-initial font-normal">
                  <input
                    type="text"
                    className={classNames(
                      "block w-8 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                      readOnly
                        ? "border-white ring-0 focus:border-white focus:ring-0"
                        : "border-white focus:border-gray-300 focus:ring-0"
                    )}
                    spellCheck={false}
                    readOnly={readOnly}
                    value={block.spec.presence_penalty}
                    onChange={(e) =>
                      handlePresencePenaltyChange(e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                <div className="flex flex-initial">top_p:</div>
                <div className="flex flex-initial font-normal">
                  <input
                    type="text"
                    className={classNames(
                      "block w-8 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                      readOnly
                        ? "border-white ring-0 focus:border-white focus:ring-0"
                        : "border-white focus:border-gray-300 focus:ring-0"
                    )}
                    spellCheck={false}
                    readOnly={readOnly}
                    value={block.spec.top_p}
                    onChange={(e) => handleTopPChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial items-center">instructions:</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-5">
              <div
                className={classNames("border border-slate-100 bg-slate-100")}
                style={{
                  minHeight: "48px",
                }}
              >
                <CodeEditor
                  data-color-mode="light"
                  readOnly={readOnly}
                  value={block.spec.instructions}
                  language="jinja2"
                  placeholder=""
                  onChange={(e) => handleInstructionsChange(e.target.value)}
                  padding={3}
                  style={{
                    color: "rgb(55 65 81)",
                    fontSize: 13,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                    backgroundColor: "rgb(241 245 249)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial items-center">messages :</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <div
                className={classNames(
                  "border bg-slate-100",
                  "border-slate-100"
                )}
              >
                <CodeEditor
                  data-color-mode="light"
                  readOnly={readOnly}
                  value={block.spec.messages_code}
                  language="js"
                  placeholder=""
                  onChange={(e) => handleMessagesCodeChange(e.target.value)}
                  padding={15}
                  style={{
                    fontSize: 12,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                    backgroundColor: "rgb(241 245 249)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col text-sm font-medium leading-8 text-gray-500">
          {functionsExpanded ? (
            <div
              onClick={() => setFunctionsExpanded(false)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronDownIcon className="mr-1 mt-0.5 h-4 w-4" />
              </span>
              functions
            </div>
          ) : (
            <div
              onClick={() => setFunctionsExpanded(true)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronRightIcon className="mr-1 mt-0.5 h-4 w-4" />
              </span>
              functions
            </div>
          )}
          {functionsExpanded ? (
            <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
              <div className="flex w-full font-normal">
                <div className="w-full leading-4">
                  <div
                    className={classNames(
                      "border bg-slate-100",
                      "border-slate-100"
                    )}
                  >
                    <CodeEditor
                      data-color-mode="light"
                      readOnly={readOnly}
                      value={block.spec.functions_code}
                      language="js"
                      placeholder=""
                      onChange={(e) =>
                        handleFunctionsCodeChange(e.target.value)
                      }
                      padding={15}
                      style={{
                        fontSize: 12,
                        fontFamily:
                          "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                        backgroundColor: "rgb(241 245 249)",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                <div className="flex flex-initial">function_call:</div>
                <div className="flex flex-initial font-normal">
                  <input
                    type="text"
                    className={classNames(
                      "block w-48 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                      readOnly
                        ? "border-white ring-0 focus:border-white focus:ring-0"
                        : "border-white focus:border-gray-300 focus:ring-0"
                    )}
                    spellCheck={false}
                    readOnly={readOnly}
                    value={block.config.function_call}
                    onChange={(e) => handleFunctionCallChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Block>
  );
}
