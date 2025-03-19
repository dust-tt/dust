import { classNames } from "@app/shared/lib/utils";
import { AssistantPicker } from "@app/ui/components/assistants/AssistantPicker";
import { AttachFile } from "@app/ui/components/conversation/AttachFile";
import { AttachFragment } from "@app/ui/components/conversation/AttachFragment";
import type { CustomEditorProps } from "@app/ui/components/input_bar/editor/useCustomEditor";
import useCustomEditor from "@app/ui/components/input_bar/editor/useCustomEditor";
import useHandleMentions from "@app/ui/components/input_bar/editor/useHandleMentions";
import { usePublicAssistantSuggestions } from "@app/ui/components/input_bar/editor/usePublicAssistantSuggestions";
import { InputBarContext } from "@app/ui/components/input_bar/InputBarContext";
import type { FileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import type {
  AgentMentionType,
  ExtensionWorkspaceType,
  LightAgentConfigurationType,
} from "@dust-tt/client";
import { SplitButton } from "@dust-tt/sparkle";
import { EditorContent } from "@tiptap/react";
import { useContext, useEffect } from "react";

export interface InputBarContainerProps {
  allAssistants: LightAgentConfigurationType[];
  agentConfigurations: LightAgentConfigurationType[];
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  owner: ExtensionWorkspaceType;
  selectedAssistant: AgentMentionType | null;
  stickyMentions?: AgentMentionType[];
  disableAutoFocus: boolean;
  isTabIncluded: boolean;
  setIncludeTab: (includeTab: boolean) => void;
  fileUploaderService: FileUploaderService;
  isSubmitting: boolean;
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
  isSubmitting,
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
    "inline-block w-full pt-2",
    "border-0 pr-1 pl-2 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    "whitespace-pre-wrap font-normal"
  );

  const onClick = async () => {
    const jsonContent = editorService.getTextAndMentions();
    onEnterKeyDown(
      editorService.isEmpty(),
      jsonContent,
      () => {
        editorService.clearEditor();
      },
      (loading) => {
        editorService.setLoading(loading);
      }
    );
  };

  const SendAction = {
    label: "Send",
    onClick,
    isLoading: isSubmitting,
  };
  const SendWithContentAction = {
    label: "Add page text + Send",
    onClick,
    isLoading: isSubmitting,
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
        <div className="flex items-start pt-1">
          <AttachFile
            fileUploaderService={fileUploaderService}
            editorService={editorService}
            isLoading={isSubmitting}
          />
          <AssistantPicker
            owner={owner}
            size="xs"
            onItemClick={(c) => {
              editorService.insertMention({ id: c.sId, label: c.name });
            }}
            assistants={allAssistants}
            isLoading={isSubmitting}
          />
        </div>
      </div>

      <div className="flex items-center justify-end space-x-2 mt-2">
        <AttachFragment
          owner={owner}
          fileUploaderService={fileUploaderService}
          isLoading={isSubmitting}
        />
        <SplitButton
          size="sm"
          actions={[SendAction, SendWithContentAction]}
          action={isTabIncluded ? SendWithContentAction : SendAction}
          variant="highlight"
          onActionChange={(action) => {
            setIncludeTab(action === SendWithContentAction);
          }}
          disabled={
            isSubmitting ||
            editorService.isEmpty() ||
            fileUploaderService.isProcessingFiles
          }
        />
      </div>
    </div>
  );
};
