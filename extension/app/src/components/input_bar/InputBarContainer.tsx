import { ArrowUpIcon, Button } from "@dust-tt/sparkle";
import type {
  AgentMention,
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { AssistantPicker } from "@extension/components/assistants/AssistantPicker";
import type { CustomEditorProps } from "@extension/components/input_bar/editor/useCustomEditor";
import useCustomEditor from "@extension/components/input_bar/editor/useCustomEditor";
import useHandleMentions from "@extension/components/input_bar/editor/useHandleMentions";
import { usePublicAssistantSuggestions } from "@extension/components/input_bar/editor/usePublicAssistantSuggestions";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { classNames } from "@extension/lib/utils";
import { EditorContent } from "@tiptap/react";
import React, { useContext, useEffect } from "react";

export interface InputBarContainerProps {
  allAssistants: LightAgentConfigurationType[];
  agentConfigurations: LightAgentConfigurationType[];
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  owner: LightWorkspaceType;
  selectedAssistant: AgentMention | null;
  stickyMentions?: AgentMention[];
  disableAutoFocus: boolean;
}

export const InputBarContainer = ({
  allAssistants,
  agentConfigurations,
  onEnterKeyDown,
  owner,
  selectedAssistant,
  stickyMentions,
  disableAutoFocus,
}: InputBarContainerProps) => {
  const suggestions = usePublicAssistantSuggestions(agentConfigurations);

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown,
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
          "max-h-64"
        )}
      />

      <div className="flex flex-row items-end justify-between gap-2 self-stretch pb-2 pr-2 sm:flex-col sm:border-0">
        <div className="flex py-2">
          <AssistantPicker
            owner={owner}
            size="xs"
            onItemClick={(c) => {
              editorService.insertMention({ id: c.sId, label: c.name });
            }}
            assistants={allAssistants}
          />
        </div>
        <Button
          size="sm"
          icon={ArrowUpIcon}
          variant="highlight"
          disabled={editorService.isEmpty()}
          onClick={async () => {
            const jsonContent = editorService.getTextAndMentions();
            onEnterKeyDown(editorService.isEmpty(), jsonContent, () => {
              editorService.clearEditor();
            });
          }}
        />
      </div>
    </div>
  );
};
