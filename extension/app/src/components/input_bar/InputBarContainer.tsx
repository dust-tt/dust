import type {
  AgentMentionType,
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/client";
import { SplitButton } from "@dust-tt/sparkle";
import { AssistantPicker } from "@extension/components/assistants/AssistantPicker";
import { AttachFile } from "@extension/components/conversation/AttachFile";
import { AttachFragment } from "@extension/components/conversation/AttachFragment";
import type { CustomEditorProps } from "@extension/components/input_bar/editor/useCustomEditor";
import useCustomEditor from "@extension/components/input_bar/editor/useCustomEditor";
import useHandleMentions from "@extension/components/input_bar/editor/useHandleMentions";
import { usePublicAssistantSuggestions } from "@extension/components/input_bar/editor/usePublicAssistantSuggestions";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { classNames } from "@extension/lib/utils";
import { EditorContent } from "@tiptap/react";
import { useContext, useEffect } from "react";

export interface InputBarContainerProps {
  allAssistants: LightAgentConfigurationType[];
  agentConfigurations: LightAgentConfigurationType[];
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  owner: LightWorkspaceType;
  selectedAssistant: AgentMentionType | null;
  stickyMentions?: AgentMentionType[];
  disableAutoFocus: boolean;
  isTabIncluded: boolean;
  setIncludeTab: (includeTab: boolean) => void;
  fileUploaderService: FileUploaderService;
}

export const InputBarContainer = ({
  allAssistants,
  agentConfigurations,
  onEnterKeyDown,
  owner,
  selectedAssistant,
  stickyMentions,
  disableAutoFocus,
  isTabIncluded,
  setIncludeTab,
  fileUploaderService,
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
    "border-0 pr-1 pl-2 sm:pl-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal"
  );

  const onClick = async () => {
    const jsonContent = editorService.getTextAndMentions();
    onEnterKeyDown(editorService.isEmpty(), jsonContent, () => {
      editorService.clearEditor();
    });
  };

  const SendAction = {
    label: "Send",
    onClick,
  };
  const SendWithContentAction = {
    label: "Add page text + Send",
    onClick,
  };

  return (
    <div id="InputBarContainer" className="relative flex flex-col w-full">
      <div className="flex space-x-2">
        <EditorContent
          editor={editor}
          className={classNames(
            contentEditableClasses,
            "scrollbar-hide",
            "overflow-y-auto",
            "min-h-32",
            "max-h-96",
            "flex-1"
          )}
        />
        <div className="flex items-start">
          <AttachFile
            fileUploaderService={fileUploaderService}
            editorService={editorService}
          />
          <AssistantPicker
            owner={owner}
            size="xs"
            onItemClick={(c) => {
              editorService.insertMention({ id: c.sId, label: c.name });
            }}
            assistants={allAssistants}
          />
        </div>
      </div>

      <div className="flex items-center justify-end space-x-2 mt-2">
        <AttachFragment fileUploaderService={fileUploaderService} />
        <SplitButton
          size="sm"
          actions={[SendAction, SendWithContentAction]}
          action={isTabIncluded ? SendWithContentAction : SendAction}
          variant="highlight"
          onActionChange={(action) => {
            setIncludeTab(action === SendWithContentAction);
          }}
          disabled={editorService.isEmpty()}
        />
      </div>
    </div>
  );
};
