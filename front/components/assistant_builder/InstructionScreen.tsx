import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HistoryIcon,
  Page,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import { CharacterCount } from "@tiptap/extension-character-count";
import Document from "@tiptap/extension-document";
import { History } from "@tiptap/extension-history";
import Text from "@tiptap/extension-text";
import type { Editor, JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { ParagraphExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ParagraphExtension";
import { AdvancedSettings } from "@app/components/assistant_builder/AdvancedSettings";
import { InstructionSuggestions } from "@app/components/assistant_builder/instructions/InstructionSuggestions";
import { PromptDiffExtension } from "@app/components/assistant_builder/instructions/PromptDiffExtension";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/assistant_builder/instructions";
import { useAgentConfigurationHistory } from "@app/lib/swr/assistants";
import { classNames } from "@app/lib/utils";
import type {
  LightAgentConfigurationType,
  ModelConfigurationType,
  WorkspaceType,
} from "@app/types";
import { isSupportingResponseFormat } from "@app/types";

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
      PromptDiffExtension,
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

  const [diffMode, setDiffMode] = useState(false);
  const [compareVersion, setCompareVersion] =
    useState<LightAgentConfigurationType | null>(null);

  const { agentConfigurationHistory } = useAgentConfigurationHistory({
    workspaceId: owner.sId,
    agentConfigurationId,
    disabled: !agentConfigurationId,
    limit: 30,
  });
  const [currentConfig, setCurrentConfig] =
    useState<LightAgentConfigurationType | null>(null);

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

  // InstructionScreen.tsx
  useEffect(() => {
    if (!editor) {
      return;
    }

    if (diffMode && compareVersion && currentConfig) {
      const currentText = currentConfig.instructions || "";
      const compareText = compareVersion.instructions || "";

      // Apply diff in a single command
      editor.commands.applyDiff(compareText, currentText);
    } else if (!diffMode && editor) {
      // Exit diff mode if active, otherwise just set normal content
      if (editor.storage.promptDiff?.isDiffMode) {
        editor.commands.exitDiff();
      } else {
        editor.commands.setContent(
          tipTapContentFromPlainText(currentConfig?.instructions || "")
        );
        editor.setEditable(true);
      }
    }
  }, [diffMode, compareVersion, currentConfig, editor]);

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
        <div className="mt-2 flex items-center gap-2 self-end">
          {!diffMode && (
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
          )}
          {configsWithUniqueInstructions &&
            configsWithUniqueInstructions.length > 1 &&
            currentConfig && (
              <div>
                {!diffMode ? (
                  <Button
                    variant="outline"
                    icon={HistoryIcon}
                    size="sm"
                    onClick={() => {
                      setDiffMode(true);
                      setCompareVersion(configsWithUniqueInstructions[1]);
                    }}
                    tooltip="Compare with previous versions"
                  />
                ) : compareVersion ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Comparing current with:
                    </span>
                    <PromptHistory
                      // Only show previous versions (exclude current)
                      history={configsWithUniqueInstructions.slice(1)}
                      onConfigChange={setCompareVersion}
                      currentConfig={compareVersion}
                      isDiffMode={diffMode}
                    />
                    <Button
                      icon={PencilSquareIcon}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDiffMode(false);
                        editor?.commands.exitDiff();
                      }}
                      tooltip="Edit current prompt"
                    />
                  </div>
                ) : null}
              </div>
            )}
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
        <InstructionSuggestions
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
  isDiffMode,
}: {
  history: LightAgentConfigurationType[];
  onConfigChange: (config: LightAgentConfigurationType) => void;
  currentConfig: LightAgentConfigurationType;
  isDiffMode: boolean;
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
      return config.version === latestConfig?.version && !isDiffMode
        ? "Latest Version"
        : config.versionCreatedAt
          ? dateFormatter.format(new Date(config.versionCreatedAt))
          : `v${config.version}`;
    },
    [isDiffMode, latestConfig?.version]
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
