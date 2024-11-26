import {
  ArrowUpIcon,
  AttachmentIcon,
  Button,
  FullscreenExitIcon,
  FullscreenIcon,
} from "@dust-tt/sparkle";
import type {
  AgentMention,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { supportedFileExtensions } from "@dust-tt/types";
import { EditorContent } from "@tiptap/react";
import React, { useContext, useEffect, useRef, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import useAssistantSuggestions from "@app/components/assistant/conversation/input_bar/editor/useAssistantSuggestions";
import type { CustomEditorProps } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useCustomEditor from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useHandleMentions from "@app/components/assistant/conversation/input_bar/editor/useHandleMentions";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
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
}: InputBarContainerProps) => {
  const suggestions = useAssistantSuggestions(agentConfigurations, owner);

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
    "border-0 pr-1 pl-2 sm:pl-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 py-3.5",
    "whitespace-pre-wrap font-normal"
  );

  return (
    <div
      id="InputBarContainer"
      className="relative flex flex-1 flex-col sm:flex-row"
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
                accept={supportedFileExtensions.join(",")}
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
              <Button
                variant="ghost-secondary"
                icon={AttachmentIcon}
                size="xs"
                tooltip={`Add a document to the conversation (${supportedFileExtensions.join(", ")}).`}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
              />
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
            const jsonContent = editorService.getTextAndMentions();
            onEnterKeyDown(
              editorService.isEmpty(),
              jsonContent,
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
