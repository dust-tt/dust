import { RenderMarkdown } from "@app/components/RenderMarkdown";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { UserMessageType } from "@app/types/assistant/conversation";

export function UserMessage({
  message,
  children,
}: {
  message: UserMessageType;
  children?: React.ReactNode;
}) {
  return (
    <ConversationMessage
      pictureUrl={message.context.profilePictureUrl}
      name={message.context.fullName}
      messageId={message.sId}
    >
      <RenderMarkdown content={message.content} />
      <div className="flex flex-col gap-4">
        <RenderMarkdown content={message.content} />
        {children}
      </div>
    </ConversationMessage>
  );
}
