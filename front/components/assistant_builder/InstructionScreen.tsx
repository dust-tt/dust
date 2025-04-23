import {
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { CharacterCount } from "@tiptap/extension-character-count";
import Document from "@tiptap/extension-document";
import { History } from "@tiptap/extension-history";
import Text from "@tiptap/extension-text";
import type { Editor, JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ParagraphExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ParagraphExtension";
import { AdvancedSettings } from "@app/components/assistant_builder/AdvancedSettings";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/assistant_builder/instructions";
import { useAgentConfigurationHistory } from "@app/lib/swr/assistants";
import { classNames } from "@app/lib/utils";
import { debounce } from "@app/lib/utils/debounce";
import type {
  APIError,
  BuilderSuggestionsType,
  LightAgentConfigurationType,
  ModelConfigurationType,
  Result,
  WorkspaceType,
} from "@app/types";
import { Err, isSupportingResponseFormat, md5, Ok } from "@app/types";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

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
  builderState,
  setBuilderState,
  setEdited,
  resetAt,
  isUsingTemplate,
  instructionsError,
  doTypewriterEffect,
  setDoTypewriterEffect,
  agentConfigurationId,
  models,
}: {
  owner: WorkspaceType;
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
  agentConfigurationId: string | null;
  models: ModelConfigurationType[];
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

  const { agentConfigurationHistory } = useAgentConfigurationHistory({
    workspaceId: owner.sId,
    agentConfigurationId,
    disabled: !agentConfigurationId,
    limit: 30,
  });
  // Keep a memory of overriden versions, to not lose them when switching back and forth
  const [currentConfig, setCurrentConfig] =
    useState<LightAgentConfigurationType | null>(null);
  // versionNumber -> instructions
  const [overridenConfigInstructions, setOverridenConfigInstructions] =
    useState<{
      [key: string]: string;
    }>({});

  // Deduplicate configs based on instructions
  const configsWithUniqueInstructions: LightAgentConfigurationType[] =
    useMemo(() => {
      const uniqueInstructions = new Set<string>();
      const configs: LightAgentConfigurationType[] = [];
      agentConfigurationHistory?.forEach((config) => {
        if (
          !config.instructions ||
          uniqueInstructions.has(config.instructions)
        ) {
          return;
        } else {
          uniqueInstructions.add(config.instructions);
          configs.push(config);
        }
      });
      return configs;
    }, [agentConfigurationHistory]);

  useEffect(() => {
    setCurrentConfig(agentConfigurationHistory?.[0] || null);
  }, [agentConfigurationHistory]);

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
  const displayError =
    instructionsError ||
    currentCharacterCount >= INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT;

  useEffect(() => {
    editor?.setOptions({
      editorProps: {
        attributes: {
          class: classNames(
            "overflow-auto min-h-60 h-full border rounded-xl p-2",
            "transition-all duration-200 ",
            "bg-muted-background dark:bg-muted-background-night",
            displayError
              ? "border-warning-500 dark:border-warning-500-night"
              : "border-border dark:border-border-night",
            displayError
              ? "focus:ring-warning-500 dark:focus:ring-warning-500-night"
              : "focus:ring-highlight-300 dark:focus:ring-highlight-300-night",
            displayError
              ? "focus:outline-warning-500 dark:focus:outline-warning-500-night"
              : "focus:outline-highlight-200 dark:focus:outline-highlight-200-night",
            displayError
              ? "focus:border-warning-500 dark:focus:border-warning-500-night"
              : "focus:border-highlight-300 dark:focus:border-highlight-300-night"
          ),
        },
      },
    });
  }, [editor, displayError]);

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
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Command or guideline you provide to your agent to direct its
              responses.
            </span>
          </Page.P>
        </div>
        <div className="flex-grow" />
        {configsWithUniqueInstructions &&
          configsWithUniqueInstructions.length > 1 &&
          currentConfig && (
            <div className="mr-2 mt-2 self-end">
              <PromptHistory
                history={configsWithUniqueInstructions}
                onConfigChange={(config) => {
                  // Remember the instructions of the version we're leaving, if overriden
                  if (
                    currentConfig &&
                    currentConfig.instructions !== builderState.instructions
                  ) {
                    setOverridenConfigInstructions((prev) => ({
                      ...prev,
                      [currentConfig.version]: builderState.instructions,
                    }));
                  }

                  // Bring new version's instructions to the editor, fetch overriden instructions if any
                  setCurrentConfig(config);
                  editorService.resetContent(
                    tipTapContentFromPlainText(
                      overridenConfigInstructions[config.version] ||
                        config.instructions ||
                        ""
                    )
                  );
                  setBuilderState((state) => ({
                    ...state,
                    instructions:
                      overridenConfigInstructions[config.version] ||
                      config.instructions ||
                      "",
                  }));
                }}
                currentConfig={currentConfig}
              />
            </div>
          )}
        <div className="mt-2 self-end">
          <AdvancedSettings
            generationSettings={builderState.generationSettings}
            setGenerationSettings={(generationSettings) => {
              setEdited(true);
              setBuilderState((state) => ({
                ...state,
                generationSettings: {
                  ...generationSettings,
                  responseFormat: isSupportingResponseFormat(
                    generationSettings.modelSettings.modelId
                  )
                    ? generationSettings.responseFormat
                    : undefined,
                },
              }));
            }}
            models={models}
          />
        </div>
      </div>
      <div className="flex h-full flex-col gap-1">
        <div className="relative h-full min-h-60 grow gap-1 p-px">
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
        count >= maxCount
          ? "text-warning"
          : "text-muted-foreground dark:text-muted-foreground-night"
      )}
    >
      {count} / {maxCount} characters
    </span>
  );
};

function PromptHistory({
  history,
  onConfigChange,
  currentConfig,
}: {
  history: LightAgentConfigurationType[];
  onConfigChange: (config: LightAgentConfigurationType) => void;
  currentConfig: LightAgentConfigurationType;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const latestConfig = history[0];

  const getStringRepresentation = useCallback(
    (config: LightAgentConfigurationType) => {
      const dateFormatter = new Intl.DateTimeFormat(navigator.language, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      });
      return config.version === latestConfig?.version
        ? "Latest Version"
        : config.versionCreatedAt
          ? dateFormatter.format(new Date(config.versionCreatedAt))
          : `v${config.version}`;
    },
    [latestConfig]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={getStringRepresentation(currentConfig)}
          variant="outline"
          size="sm"
          isSelect
          onClick={() => setIsOpen(!isOpen)}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {history.map((config) => (
          <DropdownMenuItem
            key={config.version}
            label={getStringRepresentation(config)}
            onClick={() => {
              onConfigChange(config);
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const STATIC_SUGGESTIONS = [
  "Break down your instructions into steps to leverage the model's reasoning capabilities.",
  "Give context on how you'd like the agent to act, e.g. 'Act like a senior analyst'.",
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

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (suggestionsStatus !== "no_suggestions") {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [suggestionsStatus]);

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
    <div
      className={classNames(
        "transition-all duration-1000 ease-in-out",
        isVisible ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
      )}
    >
      <div className="relative flex flex-col">
        <div
          className={classNames(
            "heading-base flex items-center gap-2",
            "text-muted-foreground dark:text-muted-foreground-night"
          )}
        >
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
              "absolute bottom-0 left-0 top-8 w-8 border-l bg-gradient-to-l transition-opacity duration-700 ease-out",
              "border-primary-200/80 dark:border-primary-200-night/80",
              "from-white/0 to-white/70 dark:from-black/0 dark:to-black/70",
              showLeftGradients ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            className={classNames(
              "absolute bottom-0 right-0 top-8 w-8 border-r bg-gradient-to-r transition-opacity duration-700 ease-out",
              "border-primary-200/80 dark:border-primary-200-night/80",
              "from-white/0 to-white/70 dark:from-black/0 dark:to-black/70",
              showRightGradients ? "opacity-100" : "opacity-0"
            )}
          />
          {(() => {
            if (error) {
              return (
                <AnimatedSuggestion
                  variant="warning"
                  suggestion={`Error loading new suggestions:\n${error.message}`}
                />
              );
            }
            if (suggestionsStatus === "instructions_are_good") {
              return (
                <AnimatedSuggestion
                  variant="primary"
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
    </div>
  );
}

function AnimatedSuggestion({
  suggestion,
  variant = "highlight",
  afterEnter,
}: {
  suggestion: string;
  variant?: React.ComponentProps<typeof ContentMessage>["variant"];
  afterEnter?: () => void;
}) {
  return (
    <div
      className="w-80 animate-[appear_0.3s_ease-out]"
      onAnimationEnd={afterEnter}
    >
      <ContentMessage
        size="sm"
        title=""
        variant={variant}
        className="h-full w-80"
      >
        {suggestion}
      </ContentMessage>
    </div>
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
