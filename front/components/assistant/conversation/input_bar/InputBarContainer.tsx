import {
  ArrowUpIcon,
  AttachmentIcon,
  Button,
  FullscreenExitIcon,
  FullscreenIcon,
} from "@dust-tt/sparkle";
import type {
  AgentMention,
  DataSourceViewContentNode,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { getSupportedFileExtensions } from "@dust-tt/types";
import { EditorContent } from "@tiptap/react";
import React, { useContext, useEffect, useRef, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import useAssistantSuggestions from "@app/components/assistant/conversation/input_bar/editor/useAssistantSuggestions";
import type { CustomEditorProps } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useCustomEditor from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useHandleMentions from "@app/components/assistant/conversation/input_bar/editor/useHandleMentions";
import { InputBarAttachments } from "@app/components/assistant/conversation/input_bar/InputBarAttachments";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { classNames } from "@app/lib/utils";

export const INPUT_BAR_ACTIONS = [
  "attachment",
  "assistants-list",
  "assistants-list-with-actions",
  "fullscreen",
] as const;

export type InputBarAction = (typeof INPUT_BAR_ACTIONS)[number];

export interface InputBarContainerProps {
  allAssistants: LightAgentConfigurationType[];
  agentConfigurations: LightAgentConfigurationType[];
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  owner: WorkspaceType;
  selectedAssistant: AgentMention | null;
  stickyMentions?: AgentMention[];
  actions: InputBarAction[];
  disableAutoFocus: boolean;
  disableSendButton: boolean;
  fileUploaderService: FileUploaderService;
  onNodeSelect?: (node: DataSourceViewContentNode) => void;
}

const InputBarContainer = ({
  allAssistants,
  agentConfigurations,
  onEnterKeyDown,
  owner,
  selectedAssistant,
  stickyMentions,
  actions,
  disableAutoFocus,
  disableSendButton,
  fileUploaderService,
  onNodeSelect,
}: InputBarContainerProps) => {
  const suggestions = useAssistantSuggestions(agentConfigurations, owner);
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const [isExpanded, setIsExpanded] = useState(false);
  function handleExpansionToggle() {
    setIsExpanded((currentExpanded) => !currentExpanded);
    // Focus at the end of the document when toggling expansion.
    editorService.focusEnd();
  }

  function resetEditorContainerSize() {
    setIsExpanded(false);
  }

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown,
    resetEditorContainerSize,
    disableAutoFocus,
  });

  // When input bar animation is requested it means the new button was clicked (removing focus from
  // the input bar), we grab it back.
  const { animate } = useContext(InputBarContext);
  useEffect(() => {
    if (animate) {
      editorService.focusEnd();
    }
  }, [animate, editorService]);

  useHandleMentions(
    editorService,
    agentConfigurations,
    stickyMentions,
    selectedAssistant,
    disableAutoFocus
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 px-2 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal",
    "pb-6 pt-4 sm:py-3.5" // Increased padding on mobile
  );

  return (
    <div
      id="InputBarContainer"
      className="relative flex flex-1 cursor-text flex-col sm:flex-row sm:pt-0"
    >
      <EditorContent
        editor={editor}
        className={classNames(
          contentEditableClasses,
          "scrollbar-hide",
          "overflow-y-auto",
          isExpanded
            ? "h-[60vh] max-h-[60vh] lg:h-[80vh] lg:max-h-[80vh]"
            : "max-h-64"
        )}
      />

      <div className="flex flex-row items-end justify-between gap-2 self-stretch pb-3 pr-3 sm:flex-col sm:border-0">
        <div className="flex items-center py-0 sm:py-3.5">
          {actions.includes("attachment") && (
            <>
              <input
                accept={getSupportedFileExtensions().join(",")}
                onChange={async (e) => {
                  await fileUploaderService.handleFileChange(e);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                  editorService.focusEnd();
                }}
                ref={fileInputRef}
                style={{ display: "none" }}
                type="file"
                multiple={true}
              />
              {featureFlags.includes("attach_from_datasources") ? (
                <InputBarAttachments
                  fileUploaderService={fileUploaderService}
                  owner={owner}
                  isLoading={false}
                  onNodeSelect={
                    onNodeSelect ||
                    ((node) => console.log(`Selected ${node.title}`))
                  }
                />
              ) : (
                <Button
                  variant="ghost-secondary"
                  icon={AttachmentIcon}
                  size="xs"
                  tooltip={`Add a document to the conversation (${getSupportedFileExtensions().join(", ")}).`}
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                />
              )}
            </>
          )}
          {(actions.includes("assistants-list") ||
            actions.includes("assistants-list-with-actions")) && (
            <AssistantPicker
              owner={owner}
              size="xs"
              onItemClick={(c) => {
                editorService.insertMention({ id: c.sId, label: c.name });
              }}
              assistants={allAssistants}
              showFooterButtons={actions.includes(
                "assistants-list-with-actions"
              )}
            />
          )}
          {actions.includes("fullscreen") && (
            <div className="hidden sm:flex">
              <Button
                variant="ghost-secondary"
                icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
                size="xs"
                onClick={handleExpansionToggle}
              />
            </div>
          )}
        </div>
        <Button
          size="sm"
          isLoading={disableSendButton}
          icon={ArrowUpIcon}
          variant="highlight"
          disabled={editorService.isEmpty() || disableSendButton}
          onClick={async () => {
            onEnterKeyDown(
              editorService.isEmpty(),
              editorService.getMarkdownAndMentions(),
              () => {
                editorService.clearEditor();
                resetEditorContainerSize();
              },
              editorService.setLoading
            );
          }}
        />
      </div>
    </div>
  );
};

export default InputBarContainer;
