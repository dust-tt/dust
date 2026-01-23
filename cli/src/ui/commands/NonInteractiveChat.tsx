import { Box, Text } from "ink";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

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
  const [error, setError] = useState<string | null>(null);

  // Validate flags usage
  useEffect(() => {
    try {
      validateNonInteractiveFlags(
        message,
        agentSearch,
        conversationId,
        messageId,
        details,
        setError
      );
    } catch (err) {
      setError(normalizeError(err).message);
    }
  }, [message, agentSearch, conversationId, messageId, details]);

  // Handle all non-interactive operations
  useEffect(() => {
    async function handleNonInteractive() {
      try {
        // Handle messageId mode - fetch agent message from conversation
        if (messageId && conversationId) {
          await fetchAgentMessageFromConversation(
            conversationId,
            messageId,
            setError
          );
          return;
        }

        // Handle agent search and message sending
        if (!message || !agentSearch) {
          return;
        }

        // Get dust client
        const dustClientRes = await getDustClient();
        if (dustClientRes.isErr()) {
          setError(
            "Authentication Error: Try re-logging in by running `dust logout` and `dust login`"
          );
          return;
        }

        const dustClient = dustClientRes.value;
        if (!dustClient) {
          setError("Authentication required: Run `dust login` first");
          return;
        }

        // Get current user info
        const meRes = await dustClient.me();
        if (meRes.isErr()) {
          setError(`Authentication error: ${meRes.error.message}`);
          return;
        }
        const me = meRes.value;

        // Get all agents
        const agentsRes = await dustClient.getAgentConfigurations({});
        if (agentsRes.isErr()) {
          setError(`Failed to load agents: ${agentsRes.error.message}`);
          return;
        }

        const allAgents = agentsRes.value;
        if (!allAgents || allAgents.length === 0) {
          setError("No agents available: No agents found for the current user");
          return;
        }

        // Search for agents matching the search string (case-insensitive)
        const searchLower = agentSearch.toLowerCase();
        const matchingAgents = allAgents.filter((agent) =>
          agent.name.toLowerCase().startsWith(searchLower)
        );

        if (matchingAgents.length === 0) {
          setError(`Agent not found: No agent found matching "${agentSearch}"`);
          return;
        }

        if (matchingAgents.length > 1) {
          setError(
            `Multiple agents found: Multiple agents match "${agentSearch}": ${matchingAgents
              .map((a) => a.name)
              .join(", ")}`
          );
          return;
        }

        const selectedAgent = matchingAgents[0];

        // Call the standalone function
        await sendNonInteractiveMessage(
          message,
          selectedAgent,
          me,
          conversationId,
          details,
          setError
        );
      } catch (error) {
        setError(`Unexpected error: ${normalizeError(error).message}`);
      }
    }

    void handleNonInteractive();
  }, [message, agentSearch, conversationId, messageId, details]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  // Don't render anything in success cases - all output is handled via console.log
  return null;
};

export default NonInteractiveChat;
