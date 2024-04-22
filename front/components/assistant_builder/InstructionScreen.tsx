import {
  AnthropicLogo,
  Button,
  ChevronRightIcon,
  ContentMessage,
  DropdownMenu,
  GoogleLogo,
  IconButton,
  MistralLogo,
  OpenaiLogo,
  Page,
  Spinner2,
} from "@dust-tt/sparkle";
import type {
  APIError,
  AssistantCreativityLevel,
  BuilderSuggestionsType,
  ModelConfig,
  PlanType,
  Result,
  SUPPORTED_MODEL_CONFIGS,
  SupportedModel,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import {
  ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES,
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  Err,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  Ok,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import type { ComponentType } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { getSupportedModelConfig } from "@app/lib/assistant";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/assistant_builder/instructions";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { debounce } from "@app/lib/utils/debounce";

export const CREATIVITY_LEVELS = Object.entries(
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES
).map(([k, v]) => ({
  label:
    ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES[k as AssistantCreativityLevel],
  value: v,
}));

type ModelProvider = (typeof SUPPORTED_MODEL_CONFIGS)[number]["providerId"];
export const MODEL_PROVIDER_LOGOS: Record<ModelProvider, ComponentType> = {
  openai: OpenaiLogo,
  anthropic: AnthropicLogo,
  mistral: MistralLogo,
  google_ai_studio: GoogleLogo,
};

export const USED_MODEL_CONFIGS: readonly ModelConfig[] = [
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
] as const;

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
  const editor = useEditor({
    extensions: [Document, Text, Paragraph],
    content: tipTapContentFromPlainText(builderState.instructions || ""),
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const plainText = plainTextFromTipTapContent(json);
      setEdited(true);
      setBuilderState((state) => ({
        ...state,
        instructions: plainText,
      }));
    },
  });

  useEffect(() => {
    editor?.setOptions({
      editorProps: {
        attributes: {
          class:
            "min-h-60 border-structure-200 border bg-structure-50 transition-all " +
            "duration-200 rounded-xl focus:border-action-300 focus:ring-action-300 p-2 focus:outline-action-200",
        },
      },
    });
  }, [editor]);

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex flex-col sm:flex-row">
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
      <div className="flex flex-col gap-1 p-px">
        <EditorContent editor={editor} />
      </div>
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
          type="menu"
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items width={240} overflow="visible">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-end gap-2">
            <div className="w-full grow text-sm font-bold text-element-800">
              Model selection
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
                  variant="secondary"
                  hasMagnifying={false}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topRight" width={250}>
                <div className="z-[120]">
                  {USED_MODEL_CONFIGS.filter(
                    (m) => !(m.largeModel && !isUpgraded(plan))
                  ).map((modelConfig) => (
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
          <div className="flex flex-col items-end gap-2">
            <div className="w-full grow text-sm font-bold text-element-800">
              Creativity level
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
                  variant="secondary"
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

const STATIC_SUGGESTIONS = {
  status: "ok" as const,
  suggestions: [
    "Break down your instructions into steps to leverage the model's reasoning capabilities.",
    "Give context on how you'd like the assistant to act, e.g. 'Act like a senior analyst'.",
    "Add instructions on the format of the answer: tone of voice, answer in bullet points, in code blocks, etc...",
    "Try to be specific: tailor prompts with precise language to avoid ambiguity.",
    "Brevity prompt useful in productivity setups: 'When replying to the user, go straight to the point. Answer with precision and brevity.'",
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

  return (
    <Transition
      show={
        !(
          suggestions.status === "unavailable" &&
          suggestions.reason === "irrelevant"
        )
      }
      enter="transition-[max-height] duration-1000"
      enterFrom="max-h-0"
      enterTo="max-h-full"
      leave="transition-[max-height] duration-1000"
      leaveFrom="max-h-full"
      leaveTo="max-h-0"
    >
      <div className="flex flex-col gap-2">
        <div className="flex gap-1 text-base font-bold text-element-800">
          <div>Tips</div>
          {loading && <Spinner2 size="sm" />}
        </div>
        <div>
          {(() => {
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
              return (
                <div className="flex gap-2">
                  <ContentMessage
                    size="sm"
                    title=""
                    variant="sky"
                    className="transition-all"
                  >
                    {suggestions.suggestions[0]}
                  </ContentMessage>
                  <ContentMessage
                    size="sm"
                    title=""
                    variant="sky"
                    className="transition-all"
                  >
                    {suggestions.suggestions[1]}
                  </ContentMessage>
                  <IconButton
                    icon={ChevronRightIcon}
                    size="sm"
                    variant="tertiary"
                    onClick={() => {
                      setSuggestions({
                        status: "ok",
                        suggestions: [
                          ...suggestions.suggestions.slice(2),
                          ...suggestions.suggestions.slice(0, 2),
                        ],
                      });
                    }}
                  />
                </div>
              );
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
      </div>
    </Transition>
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
