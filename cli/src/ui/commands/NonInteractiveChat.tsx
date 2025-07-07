import type { FC } from "react";
import { useEffect } from "react";

import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
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
  // Validate flags usage
  useEffect(() => {
    validateNonInteractiveFlags(message, agentSearch, conversationId, messageId, details);
  }, [message, agentSearch, conversationId, messageId, details]);

  // Handle all non-interactive operations
  useEffect(() => {
    async function handleNonInteractive() {
      try {
        // Handle messageId mode - fetch agent message from conversation
        if (messageId && conversationId) {
          await fetchAgentMessageFromConversation(conversationId, messageId);
          return;
        }

        // Handle agent search and message sending
        if (!message || !agentSearch) {
          return;
        }

        // Get dust client
        const dustClient = await getDustClient();
        if (!dustClient) {
          console.error(JSON.stringify({
            error: "Authentication required",
            details: "Run `dust login` first"
          }));
          process.exit(1);
        }

        // Get current user info
        const meRes = await dustClient.me();
        if (meRes.isErr()) {
          console.error(JSON.stringify({
            error: "Authentication error",
            details: meRes.error.message
          }));
          process.exit(1);
        }
        const me = meRes.value;

        // Get all agents
        const agentsRes = await dustClient.getAgentConfigurations({});
        if (agentsRes.isErr()) {
          console.error(JSON.stringify({
            error: "Failed to load agents",
            details: agentsRes.error.message
          }));
          process.exit(1);
        }

        const allAgents = agentsRes.value;
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
        await sendNonInteractiveMessage(message, selectedAgent, me, conversationId, details);
      } catch (error) {
        console.error(JSON.stringify({
          error: "Unexpected error",
          details: normalizeError(error).message
        }));
        process.exit(1);
      }
    }

    void handleNonInteractive();
  }, [message, agentSearch, conversationId, messageId, details]);

  // Don't render anything - all output is handled via console.log/console.error
  return null;
};

export default NonInteractiveChat;