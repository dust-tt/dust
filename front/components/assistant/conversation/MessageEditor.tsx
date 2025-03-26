import type { EditorService } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import InputBarContainer from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import type { UserMessageType, WorkspaceType } from "@app/types";

interface MessageEditorProps {
  message: UserMessageType;
  owner: WorkspaceType;
  editorServiceRef: React.RefObject<EditorService>;
  submitEdit: () => Promise<void>;
}

export function MessageEditor({
  message,
  owner,
  editorServiceRef,
  submitEdit,
}: MessageEditorProps) {
  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  return (
    <InputBarContainer
      currentMessageValue={message}
      className="w-full p-0 py-0 sm:py-0 sm:leading-7"
      ref={editorServiceRef}
      selectedAssistant={null}
      onEnterKeyDown={submitEdit}
      actions={[]}
      disableAutoFocus={false}
      allAssistants={[]}
      agentConfigurations={agentConfigurations}
      owner={owner}
      hideSendButton={true}
      attachedNodes={[]}
      disableSendButton={false}
    />
  );
}
