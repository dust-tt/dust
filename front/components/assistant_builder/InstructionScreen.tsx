import {
  AnthropicLogo,
  Button,
  Collapsible,
  ContentMessage,
  DropdownMenu,
  GoogleLogo,
  MistralLogo,
  OpenaiLogo,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  ModelConfig,
  PlanType,
  SUPPORTED_MODEL_CONFIGS,
  SupportedModel,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import {
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_NEXT_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@dust-tt/types";
import type { ComponentType } from "react";
import React, { useEffect, useRef, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { classNames } from "@app/lib/utils";

export const CREATIVITY_LEVELS = [
  { label: "Deterministic", value: 0 },
  { label: "Factual", value: 0.2 },
  { label: "Balanced", value: 0.7 },
  { label: "Creative", value: 1 },
];

type ModelProvider = (typeof SUPPORTED_MODEL_CONFIGS)[number]["providerId"];
export const MODEL_PROVIDER_LOGOS: Record<ModelProvider, ComponentType> = {
  openai: OpenaiLogo,
  anthropic: AnthropicLogo,
  mistral: MistralLogo,
  google_vertex_ai: GoogleLogo,
};

const getCreativityLevelFromTemperature = (temperature: number) => {
  const closest = CREATIVITY_LEVELS.reduce((prev, curr) =>
    Math.abs(curr.value - temperature) < Math.abs(prev.value - temperature)
      ? curr
      : prev
  );
  return closest;
};

export function InstructionScreen({
  owner,
  plan,
  builderState,
  setBuilderState,
  setEdited,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    statefn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
}) {
  return (
    <div className="flex h-full max-h-[800px] w-full flex-col gap-4">
      <div className="flex">
        <div className="flex flex-col gap-2">
          <Page.Header title="Instructions" />
          <Page.P>
            <span className="text-sm text-element-700">
              Command or guideline you provide to your assistant to direct its
              responses.
            </span>
          </Page.P>
        </div>
        <div className="flex-grow" />
        <div className="self-end">
          <AdvancedSettings
            owner={owner}
            plan={plan}
            generationSettings={builderState.generationSettings}
            setGenerationSettings={(generationSettings) => {
              setEdited(true);
              setBuilderState((state) => ({
                ...state,
                generationSettings,
              }));
            }}
          />
        </div>
      </div>
      <AssistantBuilderTextArea
        placeholder="I want you to act as…"
        value={builderState.instructions}
        onChange={(value) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            instructions: value,
          }));
        }}
        error={null}
        name="assistantInstructions"
      />
      {isDevelopmentOrDustWorkspace(owner) && (
        <Suggestions instructions={builderState.instructions} />
      )}
    </div>
  );
}

function AdvancedSettings({
  owner,
  plan,
  generationSettings,
  setGenerationSettings,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  generationSettings: AssistantBuilderState["generationSettings"];
  setGenerationSettings: (
    generationSettingsSettings: AssistantBuilderState["generationSettings"]
  ) => void;
}) {
  const usedModelConfigs: ModelConfig[] = [
    GPT_4_TURBO_MODEL_CONFIG,
    GPT_3_5_TURBO_MODEL_CONFIG,
    CLAUDE_DEFAULT_MODEL_CONFIG,
    CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
    MISTRAL_MEDIUM_MODEL_CONFIG,
    MISTRAL_SMALL_MODEL_CONFIG,
    MISTRAL_LARGE_MODEL_CONFIG,
    GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  ];
  if (owner.flags.includes("mistral_next")) {
    usedModelConfigs.push(MISTRAL_NEXT_MODEL_CONFIG);
  }

  const supportedModelConfig = getSupportedModelConfig(
    generationSettings.modelSettings
  );
  if (!supportedModelConfig) {
    // unreachable
    alert("Unsupported model");
  }
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          label="Advanced settings"
          variant="tertiary"
          size="sm"
          type="select"
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items width={300} overflow="visible">
        <div className="flex flex-col gap-4">
          <div className="flex flex-row items-center gap-2">
            <div className="grow text-sm text-element-900">
              Model selection:
            </div>
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  type="select"
                  labelVisible={true}
                  label={
                    getSupportedModelConfig(generationSettings.modelSettings)
                      .displayName
                  }
                  variant="tertiary"
                  hasMagnifying={false}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topRight" width={250}>
                <div className="z-[120]">
                  {usedModelConfigs
                    .filter((m) => !(m.largeModel && !isUpgraded(plan)))
                    .map((modelConfig) => (
                      <DropdownMenu.Item
                        key={modelConfig.modelId}
                        icon={MODEL_PROVIDER_LOGOS[modelConfig.providerId]}
                        description={modelConfig.shortDescription}
                        label={modelConfig.displayName}
                        onClick={() => {
                          setGenerationSettings({
                            ...generationSettings,
                            modelSettings: {
                              modelId: modelConfig.modelId,
                              providerId: modelConfig.providerId,
                              // safe because the SupportedModel is derived from the SUPPORTED_MODEL_CONFIGS array
                            } as SupportedModel,
                          });
                        }}
                      />
                    ))}
                </div>
              </DropdownMenu.Items>
            </DropdownMenu>
          </div>
          <div className="flex flex-row items-center gap-2">
            <div className="grow text-sm text-element-900">
              Creativity level:
            </div>
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  type="select"
                  labelVisible={true}
                  label={
                    getCreativityLevelFromTemperature(
                      generationSettings?.temperature
                    ).label
                  }
                  variant="tertiary"
                  hasMagnifying={false}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topRight">
                {CREATIVITY_LEVELS.map(({ label, value }) => (
                  <DropdownMenu.Item
                    key={label}
                    label={label}
                    onClick={() => {
                      setGenerationSettings({
                        ...generationSettings,
                        temperature: value,
                      });
                    }}
                  />
                ))}
              </DropdownMenu.Items>
            </DropdownMenu>
          </div>
        </div>
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}

function AssistantBuilderTextArea({
  placeholder,
  value,
  onChange,
  error,
  name,
}: {
  placeholder: string;
  value: string | null;
  onChange: (value: string) => void;
  error?: string | null;
  name: string;
}) {
  return (
    <textarea
      name="name"
      id={name}
      className={classNames(
        "block max-h-full min-h-48 w-full min-w-0 grow rounded-md text-sm text-sm",
        !error
          ? "border-gray-300 focus:border-action-500 focus:ring-action-500"
          : "border-red-500 focus:border-red-500 focus:ring-red-500",
        "bg-structure-50 stroke-structure-50",
        "resize-none"
      )}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    />
  );
}

const STATIC_SUGGESTIONS = [
  "I want you to act as the king of the bongo.",
  "I want you to act as the king of the bongo, Bong.",
  "I want you to act as the king of the cats, Soupinou.",
];

const SUGGESTION_DEBOUNCE_DELAY = 1500;

function Suggestions({ instructions }: { instructions: string | null }) {
  const [suggestions, setSuggestions] = useState<string[]>(STATIC_SUGGESTIONS);
  const [loading, setLoading] = useState(false);
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  useEffect(() => {
    if (debounceHandle.current) {
      clearTimeout(debounceHandle.current);
      debounceHandle.current = undefined;
    }
    if (!instructions) {
      setSuggestions(STATIC_SUGGESTIONS);
    }
    if (instructions) {
      // Debounced request to generate suggestions
      debounceHandle.current = setTimeout(async () => {
        setLoading(true);
        const suggestions = await getInstructionsSuggestions(instructions);
        setSuggestions(suggestions);
        setLoading(false);
      }, SUGGESTION_DEBOUNCE_DELAY);
    }
  }, [instructions]);

  return (
    <Collapsible defaultOpen>
      <div className="flex flex-col gap-2">
        <Collapsible.Button>
          <div className="text-base font-bold text-element-800">
            Suggestions
          </div>
        </Collapsible.Button>
        <Collapsible.Panel>
          <div className="flex gap-2">
            {loading && <Spinner size="sm" />}
            {!loading &&
              suggestions.map((suggestion, index) => (
                <ContentMessage
                  size="sm"
                  title="First suggestion"
                  variant="pink"
                  key={`suggestion-${index}`}
                >
                  {suggestion}
                </ContentMessage>
              ))}
            {!loading && suggestions.length === 0 && "Looking good! 🎉"}
          </div>
        </Collapsible.Panel>
      </div>
    </Collapsible>
  );
}

async function getInstructionsSuggestions(
  instructions: string
): Promise<string[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (instructions.endsWith("testgood")) {
        resolve([]);
      } else {
        resolve([
          "A first suggestion related to " + instructions.substring(0, 20),
          "A second suggestion at time " + new Date().toLocaleTimeString(),
        ]);
      }
    }, 1000);
  });
}
