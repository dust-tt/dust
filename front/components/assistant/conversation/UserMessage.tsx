import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { RenderMarkdown } from "@app/components/RenderMarkdown";
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
      <div className="flex flex-col gap-4">
        <div>
          <RenderMarkdown content={message.content} />
        </div>
        <div>{children}</div>
      </div>
    </ConversationMessage>
  );
}
