import type { FC } from "react";
import { useEffect } from "react";

import { useAgents } from "../../utils/hooks/use_agents.js";
import { useMe } from "../../utils/hooks/use_me.js";
import {
  fetchAgentMessageFromConversation,
  sendNonInteractiveMessage,
  validateNonInteractiveFlags,
} from "./chat/nonInteractive.js";

interface NonInteractiveChatProps {
  agentSearch?: string;
  message?: string;
  conversationId?: string;
  messageId?: string;
  details?: boolean;
}

const NonInteractiveChat: FC<NonInteractiveChatProps> = ({
  agentSearch,
  message,
  conversationId,
  messageId,
  details,
}) => {
  const { me, isLoading: isMeLoading, error: meError } = useMe();
  const { allAgents, error: agentsError, isLoading: agentsIsLoading } = useAgents();

  // Validate flags usage
  useEffect(() => {
    validateNonInteractiveFlags(message, agentSearch, conversationId, messageId, details);
  }, [message, agentSearch, conversationId, messageId, details]);

  // Handle messageId mode - fetch agent message from conversation
  useEffect(() => {
    if (messageId && conversationId) {
      void fetchAgentMessageFromConversation(conversationId, messageId);
    }
  }, [messageId, conversationId]);

  // Handle agent search and message sending
  useEffect(() => {
    if (!message || !agentSearch) {
      return;
    }

    // Wait for authentication to load
    if (isMeLoading) {
      return;
    }

    // Check for authentication errors
    if (!me || meError) {
      console.error(JSON.stringify({
        error: "Authentication error",
        details: meError || "Not authenticated"
      }));
      process.exit(1);
    }

    // Wait for agents to load
    if (agentsIsLoading) {
      return;
    }

    // Check for agents loading error
    if (agentsError) {
      console.error(JSON.stringify({
        error: "Failed to load agents",
        details: agentsError
      }));
      process.exit(1);
    }

    if (!allAgents || allAgents.length === 0) {
      console.error(JSON.stringify({
        error: "No agents available",
        details: "No agents found for the current user"
      }));
      process.exit(1);
    }

    // Search for agents matching the search string (case-insensitive)
    const searchLower = agentSearch.toLowerCase();
    const matchingAgents = allAgents.filter((agent) =>
      agent.name.toLowerCase().startsWith(searchLower)
    );

    if (matchingAgents.length === 0) {
      console.error(JSON.stringify({
        error: "Agent not found",
        details: `No agent found matching "${agentSearch}"`
      }));
      process.exit(1);
    }

    if (matchingAgents.length > 1) {
      console.error(JSON.stringify({
        error: "Multiple agents found",
        details: `Multiple agents match "${agentSearch}": ${matchingAgents.map(a => a.name).join(", ")}`
      }));
      process.exit(1);
    }

    const selectedAgent = matchingAgents[0];

    // Call the standalone function
    void sendNonInteractiveMessage(message, selectedAgent, me, conversationId, details);
  }, [message, agentSearch, me, meError, isMeLoading, conversationId, details, allAgents, agentsError, agentsIsLoading]);

  // Don't render anything - all output is handled via console.log/console.error
  return null;
};

export default NonInteractiveChat;