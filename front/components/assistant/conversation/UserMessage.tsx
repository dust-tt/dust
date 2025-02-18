import {
  ArrowUpIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  ConversationMessage,
  Markdown,
  PencilSquareIcon,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  MentionType,
  UserMessageType,
  WorkspaceType,
} from "@dust-tt/types";
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
import {
  useConversation,
  useConversationMessages,
} from "@app/lib/swr/conversations";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  isLastMessage: boolean;
  message: UserMessageType;
  owner: WorkspaceType;
}

export function UserMessage({
  citations,
  conversationId,
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
  const { conversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  const sendNotification = useSendNotification();
  const { mutateMessages } = useConversationMessages({
    conversationId,
    workspaceId: owner.sId,
    limit: 50,
  });

  async function switchThread(direction: "previous" | "next") {
    if (conversation) {
      await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/change_thread`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: message.sId,
            direction,
          }),
        }
      );
      void mutateMessages();
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

    const body = {
      content: text,
      mentions,
    };

    const mRes = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/edit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!mRes.ok) {
      const data = await mRes.json();
      sendNotification({
        type: "error",
        title: "Edit message",
        description: `Error editing message: ${data.error.message}`,
      });
    }

    setIsEditing(false);
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
    if (message.previousVersionMessageId || message.nextVersionMessageId) {
      buttons.push(
        <Button
          key="previous-msg-button"
          tooltip="Previous"
          variant="outline"
          size="xs"
          onClick={
            message.previousVersionMessageId
              ? async () => {
                  await switchThread("previous");
                }
              : undefined
          }
          disabled={!message.previousVersionMessageId}
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
          onClick={
            message.nextVersionMessageId
              ? async () => {
                  await switchThread("next");
                }
              : undefined
          }
          disabled={!message.nextVersionMessageId}
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
          editMessage={message}
          className="w-full p-0 py-0 sm:py-0 sm:leading-7"
          editorServiceRef={editorServiceRef}
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
          conversationId={conversationId}
          owner={owner}
          userMessage={message}
        />
      )}
    </ConversationMessage>
  );
}
