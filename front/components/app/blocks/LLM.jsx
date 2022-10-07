import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";
import TextareaAutosize from "react-textarea-autosize";
import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";

export default function LLM({
  block,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
}) {
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

  const [fewShotExpanded, setFewShotExpanded] = useState(
    (block.spec.few_shot_prompt && block.spec.few_shot_prompt.length > 0) ||
      (block.spec.few_shot_preprompt &&
        block.spec.few_shot_preprompt.length > 0) ||
      (block.spec.few_shot_count && block.spec.few_shot_count > 0)
  );

  const [newStop, setNewStop] = useState("");

  return (
    <Block
      block={block}
      readOnly={readOnly}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
    >
      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-col sm:flex-row sm:space-x-2">
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-initial">temperature:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-8 mr-4",
                  readOnly
                    ? "border-white ring-0 focus:ring-0 focus:border-white"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                readOnly={readOnly}
                value={block.spec.temperature}
                onChange={(e) => handleTemperatureChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-initial">max tokens:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-12",
                  readOnly
                    ? "border-white ring-0 focus:ring-0 focus:border-white"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                spellCheck={false}
                readOnly={readOnly}
                value={block.spec.max_tokens}
                onChange={(e) => handleMaxTokensChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-initial">stop:</div>
            <div className="flex w-full font-normal">
              <div
                className={classNames(
                  "flex flex-row items-center font-normal text-sm"
                )}
              >
                <div className="flex flex-row items-center space-x-1">
                  {block.spec.stop.map((stop, i) => (
                    <div key={i} className="flex bg-slate-100 rounded-md px-1">
                      {stop}
                    </div>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="add"
                  value={newStop}
                  onChange={(e) => setNewStop(e.target.value)}
                  className={classNames(
                    "flex flex-1 rounded-md ring-0 px-1 font-normal text-sm py-1 w-20 ml-1",
                    "placeholder-gray-300",
                    readOnly
                      ? "border-white ring-0 focus:ring-0 focus:border-white"
                      : "border-white focus:border-gray-300 focus:ring-0"
                  )}
                  readOnly={readOnly}
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
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col text-sm font-medium text-gray-500 leading-8">
          {fewShotExpanded ? (
            <div
              onClick={() => setFewShotExpanded(false)}
              className="flex flex-initial items-center font-bold -ml-5 cursor-pointer w-24"
            >
              <span>
                <ChevronDownIcon className="h-4 w-4 mt-0.5 mr-1" />
              </span>
              few-shot
            </div>
          ) : (
            <div
              onClick={() => setFewShotExpanded(true)}
              className="flex flex-initial items-center font-bold -ml-5 cursor-pointer w-24"
            >
              <span>
                <ChevronRightIcon className="h-4 w-4 mt-0.5 mr-1" />
              </span>
              few-shot
            </div>
          )}
          {fewShotExpanded ? (
            <div className="ml-2 flex flex-col">
              <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
                <div className="flex flex-initial items-center">
                  pre prompt :
                </div>
                <div className="flex w-full font-normal">
                  <TextareaAutosize
                    minRows={1}
                    className={classNames(
                      "block w-full resize-none rounded-md px-1 font-normal text-sm py-1 font-mono bg-slate-50",
                      readOnly
                        ? "border-white ring-0 focus:ring-0 focus:border-white"
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

              <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
                <div className="flex flex-initial">count:</div>
                <div className="flex flex-initial font-normal">
                  <input
                    type="text"
                    className={classNames(
                      "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-8",
                      readOnly
                        ? "border-white ring-0 focus:ring-0 focus:border-white"
                        : "border-white focus:border-gray-300 focus:ring-0"
                    )}
                    spellCheck={false}
                    readOnly={readOnly}
                    value={block.spec.few_shot_count}
                    onChange={(e) => handleFewShotCountChange(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
                <div className="flex flex-initial items-center">prompt :</div>
                <div className="flex w-full font-normal">
                  <TextareaAutosize
                    minRows={1}
                    className={classNames(
                      "block w-full resize-none rounded-md px-1 font-normal text-sm py-1 font-mono bg-slate-50",
                      readOnly
                        ? "border-white ring-0 focus:ring-0 focus:border-white"
                        : "border-white focus:border-gray-300 focus:ring-0"
                    )}
                    readOnly={readOnly}
                    value={block.spec.few_shot_prompt}
                    onChange={(e) => handleFewShotPromptChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex flex-initial items-center">prompt :</div>
          <div className="flex w-full font-normal">
            <TextareaAutosize
              placeholder="Prompt for the model"
              className={classNames(
                "block w-full resize-none rounded-md px-1 font-normal text-sm py-1 font-mono bg-slate-50",
                readOnly
                  ? "border-white ring-0 focus:ring-0 focus:border-white"
                  : "border-white focus:border-gray-300 focus:ring-0"
              )}
              readOnly={readOnly}
              value={block.spec.prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Block>
  );
}
