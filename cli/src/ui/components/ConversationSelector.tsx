import type { ConversationWithoutContentPublicType } from "@dust-tt/client";
import { Box, Text } from "ink";
import React, { useEffect, useState } from "react";

import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import { SelectWithSearch } from "./SelectWithSearch.js";

interface ConversationSelectorProps {
  onSelect: (conversation: ConversationWithoutContentPublicType) => void;
  onCancel: () => void;
}

export const ConversationSelector: React.FC<ConversationSelectorProps> = ({
  onSelect,
  onCancel,
}) => {
  const [conversations, setConversations] = useState<
    ConversationWithoutContentPublicType[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConversations = async () => {
      try {
        setIsLoading(true);
        const dustClient = await getDustClient();
        if (!dustClient) {
          setError("Authentication required. Run `dust login` first.");
          return;
        }

        const result = await dustClient.getConversations();

        if (result.isErr()) {
          setError(`Failed to load conversations: ${result.error.message}`);
          return;
        }

        // Sort conversations by updated date (most recent first)
        const sortedConversations = result.value.sort(
          (a, b) => (b.updated || b.created) - (a.updated || a.created)
        );

        setConversations(sortedConversations);
      } catch (err) {
        setError(`Failed to load conversations: ${normalizeError(err)}`);
      } finally {
        setIsLoading(false);
      }
    };

    void loadConversations();
  }, []);

  if (isLoading) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text>Loading conversations...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press Escape to cancel</Text>
      </Box>
    );
  }

  if (conversations.length === 0) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text>No conversations found.</Text>
        <Text dimColor>Press Escape to cancel</Text>
      </Box>
    );
  }

  const formatConversationDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const searchableConversations = conversations.map((conversation) => ({
    id: conversation.sId,
    name: conversation.title || `Conversation ${conversation.sId}`,
    description: `Updated: ${formatConversationDate(
      conversation.updated || conversation.created
    )}`,
    original: conversation,
  }));

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>Select a conversation to open:</Text>
      <SelectWithSearch
        items={searchableConversations.map((conversation) => ({
          id: conversation.id,
          label: conversation.name,
        }))}
        onConfirm={(selectedIds) => {
          const selectedConversation = searchableConversations.find(
            (conversation) => conversation.id === selectedIds[0]
          );
          if (selectedConversation) {
            onSelect(selectedConversation.original);
          }
        }}
        renderItem={(item) => <Text>{item.label}</Text>}
        renderSelectedItem={(item) => <Text>{item.label}</Text>}
      />
    </Box>
  );
};
