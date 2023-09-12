import { Avatar } from "@dust-tt/sparkle";

import { useConversation } from "@app/lib/swr";
import { UserMessageType } from "@app/types/assistant/conversation";
import { WorkspaceType } from "@app/types/user";

function UserMessage({ message }: { message: UserMessageType }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        {message.user && <Avatar visual={message?.user.image} size="sm" />}
      </div>
      <div className="flex-grow">
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium">{message.context.fullName}</div>
          <div className="text-base font-normal">{message.content}</div>
        </div>
      </div>
    </div>
  );
}

export default function Conversation({
  conversationId,
  owner,
}: {
  conversationId: string;
  owner: WorkspaceType;
}) {
  const { conversation, isConversationError, isConversationLoading } =
    useConversation({
      conversationId,
      workspaceId: owner.sId,
    });

  if (isConversationLoading) {
    return <div>Loading conversation...</div>;
  } else if (isConversationError) {
    return <div>Error loading conversation</div>;
  }
  if (!conversation) {
    return <div>No conversation here</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {conversation.content.map((message) =>
        message.map((m) => {
          switch (m.type) {
            case "user_message":
              return <UserMessage message={m} key={`message-id-${m.sId}`} />;
            case "agent_message":
              return (
                <div key={`message-id-${m.sId}`}>
                  agentMessage:
                  {m.configuration.name} {m.content}
                </div>
              );
            default:
              ((message: never) => {
                console.error("Unknown message type", message);
              })(m);
          }
        })
      )}
    </div>
  );
}
