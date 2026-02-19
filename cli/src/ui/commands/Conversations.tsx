import type { ConversationWithoutContentPublicType } from "@dust-tt/client";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import { getDustClient } from "../../utils/dustClient.js";

const Conversations: FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<
    ConversationWithoutContentPublicType[]
  >([]);

  useEffect(() => {
    void (async () => {
      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        setError(dustClientRes.error.message);
        setLoading(false);
        return;
      }
      const dustClient = dustClientRes.value;
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setLoading(false);
        return;
      }

      const convRes = await dustClient.getConversations();
      if (convRes.isErr()) {
        setError(`Failed to fetch conversations: ${convRes.error.message}`);
        setLoading(false);
        return;
      }

      const convs = convRes.value
        .filter((c) => c.visibility !== "deleted")
        .slice(0, 20);

      setConversations(convs);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" /> Loading conversations...
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="red" padding={1}>
          <Text color="red">{error}</Text>
        </Box>
      </Box>
    );
  }

  if (conversations.length === 0) {
    return (
      <Box>
        <Text dimColor>No conversations found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Recent Conversations</Text>
      <Box height={1} />
      {conversations.map((conv) => {
        const date = new Date(conv.created).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const title = conv.title || "Untitled";
        return (
          <Box key={conv.sId} flexDirection="row">
            <Box width={14}>
              <Text dimColor>{date}</Text>
            </Box>
            <Box width={14}>
              <Text color="cyan">{conv.sId}</Text>
            </Box>
            <Text>{title}</Text>
          </Box>
        );
      })}
      <Box height={1} />
      <Text dimColor>Resume with: dust --resume &lt;conversationId&gt;</Text>
    </Box>
  );
};

export default Conversations;
