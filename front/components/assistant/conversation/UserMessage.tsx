import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Button,
  ConversationMessage,
  Markdown,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import type { UserMessageType, WorkspaceType } from "@dust-tt/types";
import { useContext, useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { AgentSuggestion } from "@app/components/assistant/conversation/AgentSuggestion";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  MentionBlock,
  mentionDirective,
} from "@app/components/markdown/MentionBlock";

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
  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      mention: MentionBlock,
    }),
    []
  );
  const { setEditMessage, setAnimate } = useContext(InputBarContext);

  async function first() {
    await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentThreadVersion: 0,
        }),
      }
    );
  }
  const buttons = [];
  if (message.version > 0) {
    buttons.push(
      <Button
        key="previous-msg-button"
        tooltip="Previous"
        variant="ghost"
        size="xs"
        onClick={async () => {
          await first();
        }}
        icon={ArrowLeftIcon}
        className="text-muted-foreground"
      />
    );
  }

  buttons.push(
    <Button
      key="next-msg-button"
      tooltip="Next"
      variant="ghost"
      size="xs"
      onClick={async () => {
        await first();
      }}
      icon={ArrowRightIcon}
      className="text-muted-foreground"
    />
  );

  buttons.push(
    <Button
      key="edit-msg-button"
      tooltip="Edit"
      variant="ghost"
      size="xs"
      onClick={() => {
        // setEditing((editing) => !editing);
        setEditMessage(message);
        setAnimate(true);
      }}
      icon={PencilSquareIcon}
      className="text-muted-foreground"
    />
  );

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
      <Markdown
        content={message.content}
        isStreaming={false}
        isLastMessage={isLastMessage}
        additionalMarkdownComponents={additionalMarkdownComponents}
        additionalMarkdownPlugins={additionalMarkdownPlugins}
      />
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
