import "@uiw/react-textarea-code-editor/dist.css";

import {
  Checkbox,
  CollapsibleComponent,
  Input,
  Label,
  XMarkIcon,
} from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import { useState } from "react";

import ModelPicker from "@app/components/app/ModelPicker";
import { supportsResponseFormat } from "@app/lib/providers";
import { classNames, shallowBlockClone } from "@app/lib/utils";
import type {
  AppType,
  BlockType,
  RunType,
  SpecificationBlockType,
  SpecificationType,
  WorkspaceType,
} from "@app/types";

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

    const allowResponseFormat = supportsResponseFormat(model);
    if (!allowResponseFormat) {
      delete b.config.response_format;
    }
    onBlockUpdate(b);

    setIsModelSupportsResponseFormat(allowResponseFormat);
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

  const handleResponseFormatChange = (responseFormat: string) => {
    setResponseFormatText(responseFormat);
    const b = shallowBlockClone(block);
    try {
      const parsed = responseFormat.trim()
        ? JSON.parse(responseFormat)
        : undefined;
      parsed
        ? (b.config.response_format = parsed)
        : delete b.config.response_format;
      setIsResponseFormatJsonValid(true);
      onBlockUpdate(b);
    } catch (e) {
      setIsResponseFormatJsonValid(false);
    }
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

  const handleLogprobsChange = (logprobs: boolean) => {
    const b = shallowBlockClone(block);
    b.spec.logprobs = logprobs;
    onBlockUpdate(b);
  };

  const handleTopLogprobsChange = (top_logprobs: number) => {
    const b = shallowBlockClone(block);
    b.spec.top_logprobs = top_logprobs;
    onBlockUpdate(b);
  };

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

  const [responseFormatText, setResponseFormatText] = useState(
    block.config.response_format
      ? JSON.stringify(block.config.response_format, null, 2)
      : ""
  );
  const [isResponseFormatJsonValid, setIsResponseFormatJsonValid] =
    useState(true);
  const [isModelSupportsResponseFormat, setIsModelSupportsResponseFormat] =
    useState(config ? supportsResponseFormat(config) : false);

  const theme = localStorage.getItem("theme");

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
      <div className="flex w-full flex-col gap-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center space-x-2">
            <Label className="whitespace-nowrap">Model</Label>
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
          <div className="flex items-center space-x-2">
            <Label className="whitespace-nowrap">Temperature</Label>
            <Input
              readOnly={readOnly}
              value={temperature}
              onChange={(e) => handleTemperatureChange(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Label className="whitespace-nowrap">Max tokens</Label>
            <Input
              spellCheck={false}
              readOnly={readOnly}
              value={block.spec.max_tokens || ""}
              onChange={(e) => handleMaxTokensChange(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Label className="whitespace-nowrap">Stop</Label>
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
                        className="flex rounded-md bg-muted-background px-1"
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
                  <Input
                    type="text"
                    placeholder="add stop"
                    value={newStop}
                    onChange={(e) => setNewStop(e.target.value)}
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
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen: false }}
            triggerProps={{ label: "Advanced" }}
            contentChildren={
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center space-x-2">
                    <Label>frequency_penalty</Label>
                    <Input
                      type="number"
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.frequency_penalty}
                      onChange={(e) =>
                        handleFrequencyPenaltyChange(e.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label>presence_penalty</Label>
                    <Input
                      type="number"
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.presence_penalty}
                      onChange={(e) =>
                        handlePresencePenaltyChange(e.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label>top_p</Label>
                    <Input
                      type="number"
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.top_p}
                      onChange={(e) => handleTopPChange(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label>top_logprobs</Label>
                    <Input
                      type="number"
                      readOnly={readOnly}
                      value={block.spec.top_logprobs}
                      onChange={(e) =>
                        handleTopLogprobsChange(parseInt(e.target.value))
                      }
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label>logprobs</Label>
                    <Checkbox
                      checked={block.spec.logprobs}
                      onCheckedChange={(checked) =>
                        handleLogprobsChange(!!checked)
                      }
                    />
                  </div>
                </div>

                {isModelSupportsResponseFormat ? (
                  <div className="flex flex-col gap-2 text-sm">
                    <Label>Structured Response Format</Label>
                    <div className="flex w-full font-normal">
                      <div className="w-full leading-5">
                        <CodeEditor
                          data-color-mode={theme === "dark" ? "dark" : "light"}
                          readOnly={readOnly}
                          value={responseFormatText}
                          language="json"
                          placeholder={"{\n" +
                          '  "type": "json_schema",\n' +
                          '  "json_schema": {\n' +
                          '    "name": "YourSchemaName",\n' +
                          '    "strict": true,\n' +
                          '    "schema": {\n' +
                          '      "type": "object",\n' +
                          '      "properties": {\n' +
                          '        "property1":\n' +
                          '          { "type":"string" }\n' +
                          "      },\n" +
                          '      "required": ["property1"],\n' +
                          '      "additionalProperties": false\n' +
                          "    }\n" +
                          "  }\n" +
                          "}"
                        }
                          onChange={(e) =>
                            handleResponseFormatChange(e.target.value)
                          }
                          padding={3}
                          className={classNames(
                            "rounded-lg",
                            isResponseFormatJsonValid
                              ? "bg-muted-background dark:bg-muted-background-night"
                              : "border-2 border-red-500 bg-muted-background dark:bg-muted-background-night"
                          )}
                          style={{
                            fontSize: 13,
                            fontFamily:
                              "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                            overflowY: "auto",
                            height: "400px",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            }
          />
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <Label>Instructions</Label>
          <div className="flex w-full font-normal">
            <div className="w-full leading-5">
              <CodeEditor
                data-color-mode={theme === "dark" ? "dark" : "light"}
                readOnly={readOnly}
                value={block.spec.instructions}
                language="jinja2"
                placeholder=""
                onChange={(e) => handleInstructionsChange(e.target.value)}
                padding={3}
                minHeight={80}
                className="rounded-lg bg-muted-background dark:bg-muted-background-night"
                style={{
                  fontSize: 13,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <Label>Messages</Label>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <CodeEditor
                data-color-mode={theme === "dark" ? "dark" : "light"}
                readOnly={readOnly}
                value={block.spec.messages_code}
                language="js"
                placeholder=""
                onChange={(e) => handleMessagesCodeChange(e.target.value)}
                padding={15}
                minHeight={80}
                className="rounded-lg bg-muted-background dark:bg-muted-background-night"
                style={{
                  fontSize: 12,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                }}
              />
            </div>
          </div>
        </div>
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen: false }}
            triggerProps={{ label: "Functions" }}
            contentChildren={
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex w-full font-normal">
                  <div className="w-full leading-4">
                    <CodeEditor
                      data-color-mode={theme === "dark" ? "dark" : "light"}
                      readOnly={readOnly}
                      value={block.spec.functions_code}
                      language="js"
                      placeholder=""
                      onChange={(e) =>
                        handleFunctionsCodeChange(e.target.value)
                      }
                      padding={15}
                      minHeight={80}
                      className="rounded-lg bg-muted-background dark:bg-muted-background-night"
                      style={{
                        fontSize: 12,
                        fontFamily:
                          "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-row items-center gap-2 text-sm">
                  <Label>function_call:</Label>
                  <div className="flex flex-initial font-normal">
                    <Input
                      type="text"
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.config.function_call}
                      onChange={(e) => handleFunctionCallChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            }
          />
        </div>
      </div>
    </Block>
  );
}
