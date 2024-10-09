import {
  Button,
  ContentMessage,
  DropdownMenu,
  Page,
  Popover,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  APIError,
  AssistantCreativityLevel,
  BuilderSuggestionsType,
  ModelConfigurationType,
  ModelIdType,
  PlanType,
  Result,
  SupportedModel,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  GPT_4O_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
} from "@dust-tt/types";
import { isProviderWhitelisted } from "@dust-tt/types";
import {
  ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES,
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES,
  Err,
  md5,
  Ok,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { CharacterCount } from "@tiptap/extension-character-count";
import Document from "@tiptap/extension-document";
import { History } from "@tiptap/extension-history";
import Text from "@tiptap/extension-text";
import type { Editor, JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import {
  MODEL_PROVIDER_LOGOS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/types";
import { ParagraphExtension } from "@app/components/text_editor/extensions";
import { getSupportedModelConfig } from "@app/lib/assistant";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/assistant_builder/instructions";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { classNames } from "@app/lib/utils";
import { debounce } from "@app/lib/utils/debounce";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

export const CREATIVITY_LEVELS = Object.entries(
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES
).map(([k, v]) => ({
  label:
    ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES[k as AssistantCreativityLevel],
  value: v,
}));

const BEST_PERFORMING_MODELS_ID: ModelIdType[] = [
  GPT_4O_MODEL_ID,
  CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
] as const;

function isBestPerformingModel(modelId: ModelIdType) {
  return BEST_PERFORMING_MODELS_ID.includes(modelId);
}

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
  doTypewriterEffect,
  setDoTypewriterEffect,
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
  doTypewriterEffect: boolean;
  setDoTypewriterEffect: (doTypewriterEffect: boolean) => void;
}) {
  const editor = useEditor({
    extensions: [
      Document,
      Text,
      ParagraphExtension,
      History,
      CharacterCount.configure({
        limit: INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
      }),
    ],
    editable: !doTypewriterEffect,
    content: tipTapContentFromPlainText(
      (!doTypewriterEffect && builderState.instructions) || ""
    ),
    onUpdate: ({ editor }) => {
      if (!doTypewriterEffect) {
        const json = editor.getJSON();
        const plainText = plainTextFromTipTapContent(json);
        setEdited(true);
        setBuilderState((state) => ({
          ...state,
          instructions: plainText,
        }));
      }
    },
  });
  const editorService = useInstructionEditorService(editor);

  const [letterIndex, setLetterIndex] = useState(0);

  // Beware that using this useEffect will cause a lot of re-rendering until we finished the visual effect
  // We must be careful to avoid any heavy rendering in this component
  useEffect(() => {
    if (doTypewriterEffect && editor && builderState.instructions) {
      // Get the text from content and strip HTML tags for simplicity and being able to write letter by letter
      const textContent = builderState.instructions.replace(/<[^>]*>?/gm, "");
      const delay = 2; // Typing delay in milliseconds
      if (letterIndex < textContent.length) {
        const timeoutId = setTimeout(() => {
          // Append next character
          editor
            .chain()
            .focus("end")
            .insertContent(textContent[letterIndex], {
              updateSelection: false,
            })
            .run();
          setLetterIndex(letterIndex + 1);
        }, delay);
        return () => clearTimeout(timeoutId);
      } else {
        // We reset the content at the end otherwise we lose all carriage returns (i'm not sure why)
        editor
          .chain()
          .setContent(tipTapContentFromPlainText(builderState.instructions))
          .focus("end")
          .run();
        editor.setEditable(true);
        setDoTypewriterEffect(false);
      }
    }
  }, [
    editor,
    letterIndex,
    builderState.instructions,
    doTypewriterEffect,
    setDoTypewriterEffect,
  ]);

  const currentCharacterCount = editor?.storage.characterCount.characters();

  useEffect(() => {
    editor?.setOptions({
      editorProps: {
        attributes: {
          class:
            "overflow-auto min-h-[240px] h-full border bg-structure-50 transition-all " +
            "duration-200 rounded-xl " +
            (instructionsError ||
            currentCharacterCount >= INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT
              ? "border-warning-500 focus:ring-warning-500 p-2 focus:outline-warning-500 focus:border-warning-500"
              : "border-structure-200 focus:ring-action-300 p-2 focus:outline-action-200 focus:border-action-300"),
        },
      },
    });
  }, [editor, instructionsError, currentCharacterCount]);

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
      <div className="flex h-full flex-col gap-1">
        <div className="relative h-full min-h-[240px] grow gap-1 p-px">
          <EditorContent
            editor={editor}
            className="absolute bottom-0 left-0 right-0 top-0"
          />
        </div>
        {editor && (
          <InstructionsCharacterCount
            count={currentCharacterCount}
            maxCount={INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT}
          />
        )}
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

const InstructionsCharacterCount = ({
  count,
  maxCount,
}: {
  count: number;
  maxCount: number;
}) => {
  // Display character count only when it exceeds half of the maximum limit.
  if (count <= maxCount / 2) {
    return null;
  }

  return (
    <span
      className={classNames(
        "text-end text-xs",
        count >= maxCount ? "text-red-500" : "text-slate-500"
      )}
    >
      {count} / {maxCount} characters
    </span>
  );
};

interface ModelListProps {
  modelConfigs: ModelConfigurationType[];
  onClick: (modelSettings: SupportedModel) => void;
}

function ModelList({ modelConfigs, onClick }: ModelListProps) {
  const handleClick = (modelConfig: ModelConfigurationType) => {
    onClick({
      modelId: modelConfig.modelId,
      providerId: modelConfig.providerId,
    });
  };

  return (
    <>
      {modelConfigs.map((modelConfig) => (
        <DropdownMenu.Item
          key={modelConfig.modelId}
          icon={MODEL_PROVIDER_LOGOS[modelConfig.providerId]}
          description={modelConfig.shortDescription}
          label={modelConfig.displayName}
          onClick={() => handleClick(modelConfig)}
        />
      ))}
    </>
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
  const supportedModelConfig = getSupportedModelConfig(
    generationSettings.modelSettings
  );
  if (!supportedModelConfig) {
    // unreachable
    alert("Unsupported model");
  }

  const [bestPerformingModelConfig, otherModelsConfig] =
    USED_MODEL_CONFIGS.reduce<
      [ModelConfigurationType[], ModelConfigurationType[]]
    >(
      ([best, others], m) => {
        if (
          (m.largeModel && !isUpgraded(plan)) ||
          !isProviderWhitelisted(owner, m.providerId)
        ) {
          return [best, others];
        }
        if (isBestPerformingModel(m.modelId)) {
          best.push(m);
        } else {
          others.push(m);
        }
        return [best, others];
      },
      [[], []]
    );

  return (
    <Popover
      trigger={
        <Button
          label="Advanced settings"
          variant="tertiary"
          size="sm"
          type="menu"
        />
      }
      content={
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
                  <span className="text-sm uppercase text-element-700">
                    Best performing models
                  </span>
                  <ModelList
                    modelConfigs={bestPerformingModelConfig}
                    onClick={(modelSettings) => {
                      setGenerationSettings({
                        ...generationSettings,
                        modelSettings,
                      });
                    }}
                  />
                  <span className="text-sm uppercase text-element-700">
                    Other models
                  </span>
                  <ModelList
                    modelConfigs={otherModelsConfig}
                    onClick={(modelSettings) => {
                      setGenerationSettings({
                        ...generationSettings,
                        modelSettings,
                      });
                    }}
                  />
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
      }
    />
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
        !updatedSuggestions.value.suggestions?.length
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
              <div className="flex w-max gap-2">
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
  variant?: React.ComponentProps<typeof ContentMessage>["variant"];
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
        className="h-full w-[308px]"
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
    const bestRankedSuggestions = (dustAppSuggestions.suggestions ?? []).slice(
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
