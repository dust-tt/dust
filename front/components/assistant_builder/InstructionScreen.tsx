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
  APIError,
  BuilderSuggestionsType,
  ModelConfig,
  PlanType,
  Result,
  SUPPORTED_MODEL_CONFIGS,
  SupportedModel,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import {
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  Err,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  Ok,
} from "@dust-tt/types";
import type { ComponentType } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { classNames } from "@app/lib/utils";
import { debounce } from "@app/lib/utils/debounce";

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
        <Suggestions
          owner={owner}
          instructions={builderState.instructions || ""}
        />
      )}
    </div>
  );
}

function AdvancedSettings({
  plan,
  generationSettings,
  setGenerationSettings,
}: {
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

const STATIC_SUGGESTIONS = {
  status: "ok" as const,
  suggestions: [
    "Tip: break down your instructions into steps to leverage the model's reasoning capabilities.",
    "Tip: give context on how you'd like the assistant to act, e.g. 'Act like a senior analyst'. This leverages the underlying model's internal knowledge on the expectations of that role.",
    "Tip: add instructions on the format of the answer you'd like to see: the tone of voice, whether to structure it with bullet points, in code blocks, etc...",
  ],
};

function Suggestions({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}) {
  const [suggestions, setSuggestions] = useState<BuilderSuggestionsType>(
    !instructions
      ? STATIC_SUGGESTIONS
      : { status: "unavailable", reason: "irrelevant" }
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIError | null>(null);

  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);

  const updateSuggestions = useCallback(async () => {
    if (!instructions) {
      return;
    }
    setLoading(true);
    const suggestions = await getInstructionsSuggestions(owner, instructions);
    if (suggestions.isErr()) {
      setError(suggestions.error);
      setLoading(false);
      return;
    }

    setSuggestions(suggestions.value);
    setError(null);
    setLoading(false);
  }, [owner, instructions]);

  useEffect(() => {
    if (!instructions) {
      setError(null);
      setLoading(false);
      setSuggestions(STATIC_SUGGESTIONS);
    }

    debounce(debounceHandle, updateSuggestions);
  }, [instructions, updateSuggestions]);

  if (
    suggestions.status === "unavailable" &&
    suggestions.reason === "irrelevant"
  ) {
    return null;
  }
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
            {(() => {
              if (loading) {
                return <Spinner size="sm" />;
              }
              if (error) {
                return (
                  <ContentMessage size="sm" title="Error" variant="red">
                    {error.message}
                  </ContentMessage>
                );
              }
              if (suggestions.status === "ok") {
                if (suggestions.suggestions.length === 0) {
                  return (
                    <ContentMessage size="sm" variant="slate" title="">
                      Looking good! 🎉
                    </ContentMessage>
                  );
                }
                return suggestions.suggestions
                  .slice(0, 3)
                  .map((suggestion, index) => (
                    <ContentMessage
                      size="sm"
                      title=""
                      variant="pink"
                      key={`suggestion-${index}`}
                    >
                      {suggestion}
                    </ContentMessage>
                  ));
              }
              if (
                suggestions.status === "unavailable" &&
                suggestions.reason === "user_not_finished"
              ) {
                return (
                  <ContentMessage size="sm" variant="slate" title="">
                    Suggestions will appear when you're done writing.
                  </ContentMessage>
                );
              }
            })()}
          </div>
        </Collapsible.Panel>
      </div>
    </Collapsible>
  );
}

async function getInstructionsSuggestions(
  owner: WorkspaceType,
  instructions: string
): Promise<Result<BuilderSuggestionsType, APIError>> {
  const res = await fetch(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "instructions",
      inputs: { current_instructions: instructions },
    }),
  });
  if (!res.ok) {
    return new Err({
      type: "internal_server_error",
      message: "Failed to get suggestions",
    });
  }
  return new Ok(await res.json());
}
