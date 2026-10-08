import { AgentConversations } from "../components/AgentConversations";
import { useMockConversations } from "../hooks/useMockConversations";

// Conversation and document co-edition with mock agents that give fixed
// answers. Opens on a conversation whose document is already there; a new
// conversation gets one after its first message.

export default function CoEdition() {
  const conversations = useMockConversations();
  return (
    <AgentConversations
      conversations={conversations}
      openDocumentOnLoad
      // The latest comments design: floating comments whose threads open (and
      // stay) in the comments list, with the light style.
      defaultCommentsVariant="list"
      defaultCommentStyle="light"
      subtitle="Mock agents with fixed answers: send anything to get a document to co-edit."
    />
  );
}
