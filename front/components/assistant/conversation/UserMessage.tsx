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
import { useRouter } from "next/router";
import { useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import type { EditorService } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import { MessageEditor } from "@app/components/assistant/conversation/MessageEditor";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@app/components/markdown/ContentNodeMentionBlock";
import {
  MentionBlock,
  mentionDirective,
} from "@app/components/markdown/MentionBlock";
import { useEditMessage } from "@app/lib/swr/conversations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  ConversationType,
  MentionType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";

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
      content_node_mention: ContentNodeMentionBlock,
    }),
    []
  );

  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const editMessagesFeatureFlag = featureFlags.includes("edit_messages");

  const doEditMessage = useEditMessage(owner);

  const router = useRouter();
  const switchThread = async (threadVersion: number | null) => {
    if (threadVersion !== null) {
      await router.push(
        `/w/${owner.sId}/assistant/${conversation.sId}?threadVersion=${threadVersion}`,
        undefined,
        { shallow: true }
      );
    }
  };

  const submitEdit = async () => {
    const editorService = editorServiceRef.current;
    if (!editorService || !editMessagesFeatureFlag) {
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
    await switchThread(result.message.threadVersions[0]);
    setIsEditing(false);
  };

  const buttons = [];
  if (editMessagesFeatureFlag) {
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
        message.previousThreadVersion !== null ||
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
  }

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), mentionDirective, contentNodeMentionDirective],
    []
  );

  return (
    <ConversationMessage
      pictureUrl={message.user?.image || message.context.profilePictureUrl}
      name={message.context.fullName ?? undefined}
      renderName={(name) => <div className="heading-base">{name}</div>}
      type="user"
      buttons={buttons}
      citations={citations}
    >
      {isEditing ? (
        <MessageEditor
          message={message}
          owner={owner}
          editorServiceRef={editorServiceRef}
          submitEdit={submitEdit}
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
