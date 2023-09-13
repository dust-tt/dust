import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useConversation } from "@app/lib/swr";
import { WorkspaceType } from "@app/types/user";

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
    <div className="flex-col gap-6 ">
      {conversation.content.map((message) =>
        message.map((m) => {
          switch (m.type) {
            case "user_message":
              return (
                <div
                  key={`message-id-${m.sId}`}
                  className="bg-structure-50 py-6"
                >
                  <div className="mx-auto flex max-w-4xl gap-4 px-6">
                    <UserMessage message={m} />;
                  </div>
                </div>
              );
            case "agent_message":
              return (
                <div key={`message-id-${m.sId}`} className="py-6">
                  <div className="mx-auto flex max-w-4xl gap-4 px-6">
                    agentMessage:
                    {m.configuration.name} {m.content}
                  </div>
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
