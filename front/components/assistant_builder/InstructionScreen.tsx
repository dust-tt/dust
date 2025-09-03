import {
  ArrowPathIcon,
  Button,
  ContentMessage,
  Hoverable,
  Label,
  MagicIcon,
  Page,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { CharacterCount } from "@tiptap/extension-character-count";
import Document from "@tiptap/extension-document";
import { History } from "@tiptap/extension-history";
import Text from "@tiptap/extension-text";
import type { Editor, Extensions, JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";

import {
  AGENT_BUILDER_INSTRUCTIONS_AUTO_COMPLETE_EXTENSION_NAME,
  AgentBuilderInstructionsAutoCompleteExtension,
} from "@app/components/assistant/conversation/input_bar/editor/extensions/AgentBuilderInstructionsAutoCompleteExtension";
import { ParagraphExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ParagraphExtension";
import { AdvancedSettings } from "@app/components/assistant_builder/AdvancedSettings";
import { useAssistantBuilderContext } from "@app/components/assistant_builder/contexts/AssistantBuilderContexts";
import { InstructionDiffExtension } from "@app/components/assistant_builder/instructions/InstructionDiffExtension";
import { InstructionHistory } from "@app/components/assistant_builder/instructions/InstructionsHistory";
import { InstructionSuggestions } from "@app/components/assistant_builder/instructions/InstructionSuggestions";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/assistant_builder/instructions";
import { useAgentConfigurationHistory } from "@app/lib/swr/assistants";
import { useUserMetadata } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { setUserMetadataFromClient } from "@app/lib/user";
import { classNames } from "@app/lib/utils";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type {
  LightAgentConfigurationType,
  ModelConfigurationType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { isSupportingResponseFormat } from "@app/types";

const TEMPLATE_CALLOUT_METADATA_KEY = "template_callout_dismissed";
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

const BASE_EXTENSIONS: Extensions = [
  Document,
  Text,
  ParagraphExtension,
  History,
  InstructionDiffExtension,
  CharacterCount.configure({
    limit: INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
  }),
];

export function InstructionScreen({
  owner,

  resetAt,
  isUsingTemplate,
  instructionsError,
  doTypewriterEffect,
  setDoTypewriterEffect,
  agentConfigurationId,
  models,
  isInstructionDiffMode,
  setIsInstructionDiffMode,
}: {
  owner: WorkspaceType;
  resetAt: number | null;
  isUsingTemplate: boolean;
  instructionsError: string | null;
  doTypewriterEffect: boolean;
  setDoTypewriterEffect: (doTypewriterEffect: boolean) => void;
  agentConfigurationId: string | null;
  models: ModelConfigurationType[];
  isInstructionDiffMode: boolean;
  setIsInstructionDiffMode: (isDiffMode: boolean) => void;
}) {
  const { builderState, setBuilderState, setEdited } =
    useAssistantBuilderContext();

  const { metadata, isMetadataLoading } = useUserMetadata(
    TEMPLATE_CALLOUT_METADATA_KEY
  );

  const router = useRouter();
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const extensions = useMemo(() => {
    return getAgentBuilderInstructionsExtensionsForWorkspace(
      owner,
      featureFlags
    );
  }, [owner, featureFlags]);

  const editor = useEditor({
    extensions,
    editable: !doTypewriterEffect,
    content: tipTapContentFromPlainText(
      (!doTypewriterEffect && builderState.instructions) || ""
    ),
    onUpdate: ({ editor }) => {
      if (!doTypewriterEffect && !isInstructionDiffMode) {
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

  const [compareVersion, setCompareVersion] =
    useState<LightAgentConfigurationType | null>(null);

  const { agentConfigurationHistory } = useAgentConfigurationHistory({
    workspaceId: owner.sId,
    agentConfigurationId,
    disabled: !agentConfigurationId,
    limit: 30,
  });

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

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (isInstructionDiffMode && compareVersion) {
      if (editor.storage.instructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
      }

      const currentText = plainTextFromTipTapContent(editor.getJSON());
      const compareText = compareVersion.instructions || "";

      editor.commands.applyDiff(compareText, currentText);
      editor.setEditable(false);
    } else if (!isInstructionDiffMode && editor) {
      if (editor.storage.instructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
        editor.setEditable(true);
      }
    }
  }, [isInstructionDiffMode, compareVersion, editor]);

  // Update the autocomplete extension storage (if present) with current builder state.
  useEffect(() => {
    if (!editor) {
      return;
    }

    const extension = editor.extensionManager.extensions.find(
      (ext) =>
        ext.name === AGENT_BUILDER_INSTRUCTIONS_AUTO_COMPLETE_EXTENSION_NAME
    );
    if (extension) {
      extension.storage.builderState = builderState;
    }
  }, [editor, builderState]);

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });

  const [isTemplateCalloutDismissed, setIsTemplateCalloutDismissed] =
    useState(false);

  const mustShowTemplateCallout = useMemo(() => {
    if (isUsingTemplate || agentConfigurationHistory || isMetadataLoading) {
      return false;
    }

    return metadata?.value !== "true";
  }, [metadata, isMetadataLoading, isUsingTemplate, agentConfigurationHistory]);

  const dismissTemplateCallout = () => {
    setIsTemplateCalloutDismissed(true);
    void setUserMetadataFromClient({
      key: TEMPLATE_CALLOUT_METADATA_KEY,
      value: "true",
    });
  };

  const restoreVersion = () => {
    const text = compareVersion?.instructions;
    if (!editor || !text) {
      return;
    }

    setEdited(true);
    setBuilderState((state) => ({
      ...state,
      instructions: text,
    }));

    if (editor.storage.instructionDiff?.isDiffMode) {
      editor.commands.exitDiff();
    }

    editorService.resetContent(tipTapContentFromPlainText(text));

    setCompareVersion(null);
    setIsInstructionDiffMode(false);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {mustShowTemplateCallout && (
        <div
          className={classNames(
            "",
            isTemplateCalloutDismissed && "animate-fade-collapse"
          )}
        >
          <ContentMessage
            title="Don't know how get started?"
            variant="highlight"
            size="sm"
            icon={MagicIcon}
          >
            We've carefully crafted some templates for you!
            <div className="mt-2">
              <Button
                variant="highlight"
                size="xs"
                onClick={() => {
                  void router.push(getAgentBuilderRoute(owner.sId, "create"));
                }}
                label="Browse templates"
              />
              <Button
                variant="secondary"
                size="xs"
                onClick={dismissTemplateCallout}
                label="Dismiss"
              />
            </div>
          </ContentMessage>
        </div>
      )}
      <div className="flex flex-col items-center justify-between sm:flex-row">
        <Page.P>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Command or guideline you provide to your agent to direct its
            responses.
            {!mustShowTemplateCallout &&
              !isUsingTemplate &&
              !agentConfigurationHistory &&
              !isMetadataLoading && (
                <>
                  {" "}
                  You can also use one of our{" "}
                  <Hoverable
                    variant="highlight"
                    href={getAgentBuilderRoute(owner.sId, "create")}
                    target="_blank"
                  >
                    templates
                  </Hoverable>
                  .
                </>
              )}
          </span>
        </Page.P>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            {!isInstructionDiffMode && (
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

            {agentConfigurationHistory &&
              agentConfigurationHistory.length > 1 && (
                <InstructionHistory
                  history={agentConfigurationHistory}
                  selectedConfig={compareVersion}
                  onSelect={(config) => {
                    setCompareVersion(config);
                    setIsInstructionDiffMode(true);
                  }}
                  owner={owner}
                  agentConfigurationId={agentConfigurationId}
                />
              )}
          </div>
        </div>
      </div>

      {isInstructionDiffMode && compareVersion && (
        <>
          <Separator />
          {compareVersion?.versionCreatedAt && (
            <Label>
              Comparing current version with{" "}
              {dateFormatter.format(new Date(compareVersion.versionCreatedAt))}
            </Label>
          )}
          <div className="flex gap-2">
            <Button
              icon={XMarkIcon}
              variant="outline"
              size="sm"
              onClick={() => {
                setIsInstructionDiffMode(false);
                setCompareVersion(null);
              }}
              label="Leave comparison mode"
            />

            <Button
              variant="warning"
              size="sm"
              icon={ArrowPathIcon}
              onClick={restoreVersion}
              label="Restore this version"
            />
          </div>
        </>
      )}

      <div className="flex h-full flex-col gap-1">
        <div className="dd-privacy-mask relative h-full min-h-60 grow gap-1 p-px">
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

function getAgentBuilderInstructionsExtensionsForWorkspace(
  owner: WorkspaceType,
  featureFlags: WhitelistableFeature[]
): Extensions {
  if (featureFlags.includes("agent_builder_instructions_autocomplete")) {
    return [
      ...BASE_EXTENSIONS,
      AgentBuilderInstructionsAutoCompleteExtension.configure({
        owner,
      }),
    ];
  }

  return BASE_EXTENSIONS;
}
