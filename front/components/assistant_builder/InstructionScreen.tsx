import {
  AnthropicLogo,
  Button,
  ContentMessage,
  DropdownMenu,
  GoogleLogo,
  MistralLogo,
  OpenaiLogo,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type { ContentMessageProps } from "@dust-tt/sparkle/dist/cjs/components/ContentMessage";
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
  CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG,
  Err,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  md5,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  Ok,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import Document from "@tiptap/extension-document";
import { History } from "@tiptap/extension-history";
import Text from "@tiptap/extension-text";
import type { Editor, JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { ComponentType } from "react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { ParagraphExtension } from "@app/components/text_editor/extensions";
import { getSupportedModelConfig } from "@app/lib/assistant";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/assistant_builder/instructions";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { classNames } from "@app/lib/utils";
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
  GPT_4O_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
] as const;

export const MAX_INSTRUCTIONS_LENGTH = 1_000_000;

const getCreativityLevelFromTemperature = (temperature: number) => {
  const closest = CREATIVITY_LEVELS.reduce((prev, curr) =>
    Math.abs(curr.value - temperature) < Math.abs(prev.value - temperature)
      ? curr
      : prev
  );
  return closest;
};

const useInstructionEditorService = (editor: Editor | null) => {
  const editorService = useMemo(() => {
    return {
      resetContent(content: JSONContent) {
        return editor?.commands.setContent(content);
      },
    };
  }, [editor]);

  return editorService;
};

export function InstructionScreen({
  owner,
  plan,
  builderState,
  setBuilderState,
  setEdited,
  resetAt,
  isUsingTemplate,
  instructionsError,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    statefn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  resetAt: number | null;
  isUsingTemplate: boolean;
  instructionsError: string | null;
}) {
  const editor = useEditor({
    extensions: [Document, Text, ParagraphExtension, History],
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
  const editorService = useInstructionEditorService(editor);

  useEffect(() => {
    editor?.setOptions({
      editorProps: {
        attributes: {
          class:
            "overflow-auto min-h-[240px] h-full border bg-structure-50 transition-all " +
            "duration-200 rounded-xl " +
            (instructionsError
              ? "border-warning-500 focus:ring-warning-500 p-2 focus:outline-warning-500 focus:border-warning-500"
              : "border-structure-200 focus:ring-action-300 p-2 focus:outline-action-200 focus:border-action-300"),
        },
      },
    });
  }, [editor, instructionsError]);

  useEffect(() => {
    if (resetAt != null) {
      editorService.resetContent(
        tipTapContentFromPlainText(builderState.instructions || "")
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetAt]);

  return (
    <div className="flex grow flex-col gap-4">
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
      <div className="relative h-full min-h-[240px] grow gap-1 p-px">
        <EditorContent
          editor={editor}
          className="absolute bottom-0 left-0 right-0 top-0"
        />
      </div>
      {instructionsError && (
        <div className="-mt-3 ml-2 text-sm text-warning-500">
          {instructionsError}
        </div>
      )}
      {!isUsingTemplate && (
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

const STATIC_SUGGESTIONS = [
  "Break down your instructions into steps to leverage the model's reasoning capabilities.",
  "Give context on how you'd like the assistant to act, e.g. 'Act like a senior analyst'.",
  "Add instructions on the format of the answer: tone of voice, answer in bullet points, in code blocks, etc...",
  "Try to be specific: tailor prompts with precise language to avoid ambiguity.",
];

type SuggestionStatus =
  | "no_suggestions"
  | "loading"
  | "suggestions_available"
  | "instructions_are_good"
  | "error";

function Suggestions({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}) {
  // history of all suggestions. The first two are displayed.
  const [suggestions, setSuggestions] = useState<string[]>(
    !instructions ? STATIC_SUGGESTIONS : []
  );
  const [suggestionsStatus, setSuggestionsStatus] = useState<SuggestionStatus>(
    !instructions ? "suggestions_available" : "no_suggestions"
  );

  const horinzontallyScrollableDiv = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<APIError | null>(null);

  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);

  // the ref allows comparing previous instructions to current instructions
  // in the effect below
  const previousInstructions = useRef<string | null>(instructions);

  useEffect(() => {
    // update suggestions when (and only when) instructions change
    if (instructions === previousInstructions.current) {
      return;
    }
    previousInstructions.current = instructions;

    if (!instructions.trim()) {
      setError(null);
      setSuggestionsStatus(
        suggestions.length > 0 ? "suggestions_available" : "no_suggestions"
      );
      clearTimeout(debounceHandle.current);
      return;
    }

    const updateSuggestions = async () => {
      setSuggestionsStatus("loading");
      // suggestions that are shown by default when no instructions are typed,
      // are not considered as former suggestions. This way, the model will
      // always generate tailored suggestions on the first input, which is preferable:
      // - the user is more likely to be interested (since they likely saw the static suggestions before)
      // - the model is not biased by static suggestions to generate new ones.
      const formerSuggestions =
        suggestions === STATIC_SUGGESTIONS ? [] : suggestions.slice(0, 2);
      const updatedSuggestions = await getRankedSuggestions({
        owner,
        currentInstructions: instructions,
        formerSuggestions,
      });
      if (updatedSuggestions.isErr()) {
        setError(updatedSuggestions.error);
        setSuggestionsStatus("error");
        return;
      }
      if (
        updatedSuggestions.value.status === "ok" &&
        !updatedSuggestions.value.suggestions.length
      ) {
        setSuggestionsStatus("instructions_are_good");
        return;
      }
      const newSuggestions = mergeSuggestions(
        suggestions,
        updatedSuggestions.value
      );
      if (newSuggestions.length > suggestions.length) {
        // only update suggestions if they have changed, & reset scroll
        setSuggestions(newSuggestions);
        horinzontallyScrollableDiv.current?.scrollTo(0, 0);
      }
      setError(null);
      setSuggestionsStatus("suggestions_available");
    };

    debounce(debounceHandle, updateSuggestions);
    return () => {
      if (debounceHandle.current) {
        clearTimeout(debounceHandle.current);
        debounceHandle.current = undefined;
      }
    };
  }, [instructions, owner, suggestions]);

  const [showLeftGradients, setshowLeftGradients] = useState(false);
  const [showRightGradients, setshowRightGradients] = useState(false);

  const showCorrectGradients = () => {
    const scrollableDiv = horinzontallyScrollableDiv.current;
    if (!scrollableDiv) {
      return;
    }
    const scrollLeft = scrollableDiv.scrollLeft;
    const isScrollable = scrollableDiv.scrollWidth > scrollableDiv.clientWidth;

    setshowLeftGradients(scrollLeft > 0);
    setshowRightGradients(
      isScrollable &&
        scrollLeft < scrollableDiv.scrollWidth - scrollableDiv.clientWidth
    );
  };

  return (
    <Transition
      show={suggestionsStatus !== "no_suggestions"}
      enter="transition-[max-height] duration-1000"
      enterFrom="max-h-0"
      enterTo="max-h-full"
      leave="transition-[max-height] duration-1000"
      leaveFrom="max-h-full"
      leaveTo="max-h-0"
    >
      <div className="relative flex flex-col">
        <div className="flex items-center gap-2 text-base font-bold text-element-800">
          <div>Tips</div>
          {suggestionsStatus === "loading" && <Spinner size="xs" />}
        </div>
        <div
          className="overflow-y-auto pt-2 scrollbar-hide"
          ref={horinzontallyScrollableDiv}
          onScroll={showCorrectGradients}
        >
          <div
            className={classNames(
              "absolute bottom-0 left-0 top-8 w-8 border-l border-structure-200/80 bg-gradient-to-l from-white/0 to-white/70 transition-opacity duration-700 ease-out",
              showLeftGradients ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            className={classNames(
              "absolute bottom-0 right-0 top-8 w-8 border-r border-structure-200/80 bg-gradient-to-r from-white/0 to-white/70 transition-opacity duration-700 ease-out",
              showRightGradients ? "opacity-100" : "opacity-0"
            )}
          />
          {(() => {
            if (error) {
              return (
                <AnimatedSuggestion
                  variant="red"
                  suggestion={`Error loading new suggestions:\n${error.message}`}
                />
              );
            }
            if (suggestionsStatus === "instructions_are_good") {
              return (
                <AnimatedSuggestion
                  variant="slate"
                  suggestion="Looking good! 🎉"
                />
              );
            }
            return (
              <div className="flex w-max">
                {suggestions.map((suggestion) => (
                  <AnimatedSuggestion
                    suggestion={suggestion}
                    key={md5(suggestion)}
                    afterEnter={showCorrectGradients}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </Transition>
  );
}

function AnimatedSuggestion({
  suggestion,
  variant = "sky",
  afterEnter,
}: {
  suggestion: string;
  variant?: ContentMessageProps["variant"];
  afterEnter?: () => void;
}) {
  return (
    <Transition
      appear={true}
      enter="transition-all ease-out duration-300"
      enterFrom="opacity-0 w-0"
      enterTo="opacity-100 w-[320px]"
      leave="ease-in duration-300"
      leaveFrom="opacity-100 w-[320px]"
      leaveTo="opacity-0 w-0"
      afterEnter={afterEnter}
    >
      <ContentMessage
        size="sm"
        title=""
        variant={variant}
        className="h-fit w-[308px]"
      >
        {suggestion}
      </ContentMessage>
    </Transition>
  );
}

/*  Returns suggestions as per the dust app:
 * - empty array if the instructions are good;
 * - otherwise, 2 former suggestions + 2 new suggestions, ranked by order of relevance.
 */
async function getRankedSuggestions({
  owner,
  currentInstructions,
  formerSuggestions,
}: {
  owner: WorkspaceType;
  currentInstructions: string;
  formerSuggestions: string[];
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  const res = await fetch(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "instructions",
      inputs: {
        current_instructions: currentInstructions,
        former_suggestions: formerSuggestions,
      },
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

const VISIBLE_SUGGESTIONS_NUMBER = 2;
/**
 *
 * @param suggestions existing suggestions
 * @param dustAppSuggestions suggestions returned by the dust app via getRankedSuggestions
 * @returns suggestions updated with the new ones that ranked better than the visible ones if any
 */
function mergeSuggestions(
  suggestions: string[],
  dustAppSuggestions: BuilderSuggestionsType
): string[] {
  if (dustAppSuggestions.status === "ok") {
    const visibleSuggestions = suggestions.slice(0, VISIBLE_SUGGESTIONS_NUMBER);
    const bestRankedSuggestions = dustAppSuggestions.suggestions.slice(
      0,
      VISIBLE_SUGGESTIONS_NUMBER
    );

    // Reorder existing suggestions with best ranked first
    const mergedSuggestions = [
      ...suggestions.filter((suggestion) =>
        bestRankedSuggestions.includes(suggestion)
      ),
      ...suggestions.filter(
        (suggestion) => !bestRankedSuggestions.includes(suggestion)
      ),
    ];
    // insert new good ones
    for (const suggestion of bestRankedSuggestions) {
      if (!visibleSuggestions.includes(suggestion)) {
        mergedSuggestions.unshift(suggestion);
      }
    }
    return mergedSuggestions;
  }
  return suggestions;
}
