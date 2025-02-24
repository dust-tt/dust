import {
  ArrowUpIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  ConversationMessage,
  Markdown,
  PencilSquareIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  ConversationType,
  MentionType,
  UserMessageType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import type { EditorService } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import InputBarContainer from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  MentionBlock,
  mentionDirective,
} from "@app/components/markdown/MentionBlock";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useEditMessage } from "@app/lib/swr/conversations";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversation: ConversationType;
  isLastMessage: boolean;
  message: UserMessageType;
  owner: WorkspaceType;
}

export function UserMessage({
  citations,
  conversation,
  isLastMessage,
  message,
  owner,
}: UserMessageProps) {
  const editorServiceRef = useRef<EditorService>(null);
  const [isEditing, setIsEditing] = useState(false);
  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      mention: MentionBlock,
    }),
    []
  );

  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  const doEditMessage = useEditMessage(owner);

  const router = useRouter();
  async function switchThread(threadVersion: number | null) {
    if (threadVersion != null) {
      await router.push(
        `/w/${owner.sId}/assistant/${conversation.sId}?threadVersion=${threadVersion}`
      );
    }
  }

  const submitEdit = async () => {
    const editorService = editorServiceRef.current;
    if (!editorService) {
      return;
    }

    const isEmpty = editorService.isEmpty();
    const jsonContent = editorService.getTextAndMentions();

    if (isEmpty) {
      return;
    }

    const { mentions: rawMentions, text } = jsonContent;
    const mentions: MentionType[] = [
      ...new Set(rawMentions.map((mention) => mention.id)),
    ].map((id) => ({ configurationId: id }));

    const result = await doEditMessage(conversation, message, text, mentions);
    setIsEditing(false);
    await switchThread(result.message.threadVersions[0]);
  };

  const buttons = [];
  if (isEditing) {
    buttons.push(
      <Button
        key="edit-msg-button"
        tooltip="Cancel"
        variant="outline"
        size="xs"
        onClick={() => {
          setIsEditing(false);
        }}
        icon={XMarkIcon}
        className="text-muted-foreground"
      />
    );

    buttons.push(
      <Button
        key="send-msg-button"
        tooltip="Send"
        variant="outline"
        size="xs"
        onClick={() => {
          void submitEdit();
        }}
        icon={ArrowUpIcon}
        className="text-muted-foreground"
      />
    );
  } else {
    if (
      message.previousThreadVersion != null ||
      message.nextThreadVersion != null
    ) {
      buttons.push(
        <Button
          key="previous-msg-button"
          tooltip="Previous"
          variant="outline"
          size="xs"
          onClick={async () => {
            await switchThread(message.previousThreadVersion);
          }}
          disabled={message.previousThreadVersion === null}
          icon={ChevronLeftIcon}
          className="text-muted-foreground"
        />
      );

      buttons.push(
        <Button
          key="next-msg-button"
          tooltip="Next"
          variant="outline"
          size="xs"
          onClick={async () => {
            await switchThread(message.nextThreadVersion);
          }}
          disabled={message.nextThreadVersion === null}
          icon={ChevronRightIcon}
          className="text-muted-foreground"
        />
      );
    }

    buttons.push(
      <Button
        key="edit-msg-button"
        tooltip="Edit"
        variant="outline"
        size="xs"
        onClick={() => {
          setIsEditing(true);
        }}
        icon={PencilSquareIcon}
        className="text-muted-foreground"
      />
    );
  }

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), mentionDirective],
    []
  );

  return (
    <ConversationMessage
      pictureUrl={message.user?.image || message.context.profilePictureUrl}
      name={message.context.fullName ?? undefined}
      renderName={(name) => <div className="text-base font-medium">{name}</div>}
      type="user"
      buttons={buttons}
      citations={citations}
    >
      {isEditing ? (
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
          disableSendButton={false}
        />
      ) : (
        <Markdown
          content={message.content}
          isStreaming={false}
          isLastMessage={isLastMessage}
          additionalMarkdownComponents={additionalMarkdownComponents}
          additionalMarkdownPlugins={additionalMarkdownPlugins}
        />
      )}
      {message.mentions.length === 0 && isLastMessage && (
        <AgentSuggestion
          conversation={conversation}
          owner={owner}
          userMessage={message}
          switchThread={switchThread}
        />
      )}
    </ConversationMessage>
  );
}
