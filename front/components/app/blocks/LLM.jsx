import Block from "./Block";
import { classNames, shallowBlockClone } from "@app/lib/utils";
import dynamic from "next/dynamic";
import TextareaAutosize from "react-textarea-autosize";
import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import "@uiw/react-textarea-code-editor/dist.css";
import ModelPicker from "@app/components/app/ModelPicker";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function LLM({
  user,
  app,
  spec,
  run,
  block,
  status,
  running,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
  onBlockNew,
}) {
  const handleModelChange = (model) => {
    let b = shallowBlockClone(block);
    b.config.provider_id = model.provider_id;
    b.config.model_id = model.model_id;
    onBlockUpdate(b);
  };

  const handleTemperatureChange = (temperature) => {
    let b = shallowBlockClone(block);
    b.spec.temperature = temperature;
    onBlockUpdate(b);
  };

  const handleMaxTokensChange = (max_tokens) => {
    let b = shallowBlockClone(block);
    b.spec.max_tokens = max_tokens;
    onBlockUpdate(b);
  };

  const handleAddStop = (stop) => {
    let b = shallowBlockClone(block);
    b.spec.stop.push(stop);
    onBlockUpdate(b);
    setNewStop("");
  };

  const handleRemoveStop = () => {
    if (block.spec.stop.length > 0) {
      let b = shallowBlockClone(block);
      b.spec.stop.splice(b.spec.stop.length - 1, 1);
      onBlockUpdate(b);
    }
  };

  const handlePresencePenaltyChange = (presence_penalty) => {
    let b = shallowBlockClone(block);
    b.spec.presence_penalty = presence_penalty;
    onBlockUpdate(b);
  };

  const handleFrequencyPenaltyChange = (frequency_penalty) => {
    let b = shallowBlockClone(block);
    b.spec.frequency_penalty = frequency_penalty;
    onBlockUpdate(b);
  };

  const handleTopLogprobsChange = (top_logprobs) => {
    let b = shallowBlockClone(block);
    b.spec.top_logprobs = top_logprobs;
    onBlockUpdate(b);
  };

  const handleTopPChange = (top_p) => {
    let b = shallowBlockClone(block);
    b.spec.top_p = top_p;
    onBlockUpdate(b);
  };

  const handlePromptChange = (prompt) => {
    let b = shallowBlockClone(block);
    b.spec.prompt = prompt;
    onBlockUpdate(b);
  };

  const handleFewShotPrePromptChange = (prompt) => {
    let b = shallowBlockClone(block);
    b.spec.few_shot_preprompt = prompt;
    onBlockUpdate(b);
  };

  const handleFewShotPromptChange = (prompt) => {
    let b = shallowBlockClone(block);
    b.spec.few_shot_prompt = prompt;
    onBlockUpdate(b);
  };

  const handleFewShotCountChange = (count) => {
    let b = shallowBlockClone(block);
    b.spec.few_shot_count = count;
    onBlockUpdate(b);
  };

  const fewShotPresent =
    (block.spec.few_shot_prompt && block.spec.few_shot_prompt.length > 0) ||
    (block.spec.few_shot_preprompt &&
      block.spec.few_shot_preprompt.length > 0) ||
    (block.spec.few_shot_count && block.spec.few_shot_count > 0);

  const [fewShotExpanded, setFewShotExpanded] = useState(fewShotPresent);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  const [newStop, setNewStop] = useState("");

  return (
    <Block
      user={user}
      app={app}
      spec={spec}
      run={run}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
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
              user={user}
              readOnly={readOnly}
              model={
                block.config ? block.config : { provider_id: "", model_id: "" }
              }
              onModelUpdate={(model) => {
                handleModelChange(model);
              }}
              chatOnly={false}
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
                value={block.spec.temperature}
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
                value={block.spec.max_tokens}
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
                  {(block.spec.stop || []).map((stop, i) => (
                    <div key={i} className="flex rounded-md bg-slate-100 px-1">
                      {stop}
                    </div>
                  ))}
                </div>
                {readOnly ? null : (
                  <input
                    type="text"
                    placeholder="add"
                    value={newStop}
                    onChange={(e) => setNewStop(e.target.value)}
                    className={classNames(
                      "ml-1 flex w-20 flex-1 rounded-md px-1 py-1 text-sm font-normal ring-0",
                      "placeholder-gray-300",
                      readOnly
                        ? "border-white ring-0 focus:border-white focus:ring-0"
                        : "border-white focus:border-gray-300 focus:ring-0"
                    )}
                    readOnly={readOnly}
                    onBlur={(e) => {
                      if (e.target.value.trim().length > 0) {
                        handleAddStop(e.target.value);
                        e.preventDefault();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        (e.key === "Tab" || e.key == "Enter") &&
                        e.target.value.length > 0
                      ) {
                        handleAddStop(e.target.value);
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
                <ChevronDownIcon className="mt-0.5 mr-1 h-4 w-4" />
              </span>
              advanced
            </div>
          ) : (
            <div
              onClick={() => setAdvancedExpanded(true)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronRightIcon className="mt-0.5 mr-1 h-4 w-4" />
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
              <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                <div className="flex flex-initial">top_logprobs:</div>
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
                    value={block.spec.top_logprobs}
                    onChange={(e) => handleTopLogprobsChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {fewShotPresent ? (
          <div className="flex flex-col text-sm font-medium leading-8 text-gray-500">
            {fewShotExpanded ? (
              <div
                onClick={() => setFewShotExpanded(false)}
                className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
              >
                <span>
                  <ChevronDownIcon className="mt-0.5 mr-1 h-4 w-4" />
                </span>
                few-shot
              </div>
            ) : (
              <div
                onClick={() => setFewShotExpanded(true)}
                className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
              >
                <span>
                  <ChevronRightIcon className="mt-0.5 mr-1 h-4 w-4" />
                </span>
                few-shot
              </div>
            )}
            {fewShotExpanded ? (
              <div className="ml-6 flex flex-col">
                <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial items-center">
                    introduction:
                  </div>
                  <div className="flex w-full font-normal">
                    <TextareaAutosize
                      minRows={1}
                      className={classNames(
                        "block w-full resize-none rounded-md bg-slate-100 px-1 py-1 font-mono text-[13px] font-normal",
                        readOnly
                          ? "border-white ring-0 focus:border-white focus:ring-0"
                          : "border-white focus:border-gray-300 focus:ring-0"
                      )}
                      readOnly={readOnly}
                      value={block.spec.few_shot_preprompt}
                      onChange={(e) =>
                        handleFewShotPrePromptChange(e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial items-center">
                    examples:
                  </div>
                  <div className="flex w-full font-normal">
                    <TextareaAutosize
                      minRows={1}
                      className={classNames(
                        "block w-full resize-none rounded-md bg-slate-100 px-1 py-1 font-mono text-[13px] font-normal",
                        readOnly
                          ? "border-white ring-0 focus:border-white focus:ring-0"
                          : "border-white focus:border-gray-300 focus:ring-0"
                      )}
                      readOnly={readOnly}
                      value={block.spec.few_shot_prompt}
                      onChange={(e) =>
                        handleFewShotPromptChange(e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial">count:</div>
                  <div className="flex flex-initial font-normal">
                    <input
                      type="text"
                      className={classNames(
                        "block w-8 flex-1 px-1 py-1 text-sm font-normal",
                        readOnly
                          ? "border-white ring-0 focus:border-white focus:ring-0"
                          : "border-white focus:border-gray-300 focus:ring-0"
                      )}
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.few_shot_count}
                      onChange={(e) => handleFewShotCountChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial items-center">prompt:</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-5">
              <div
                className={classNames("border border-slate-100 bg-slate-100")}
                style={{
                  minHeight: "48px",
                }}
              >
                <CodeEditor
                  readOnly={readOnly}
                  value={block.spec.prompt}
                  language="jinja2"
                  placeholder=""
                  onChange={(e) => handlePromptChange(e.target.value)}
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
      </div>
    </Block>
  );
}
