import React, { memo } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import type { ConversationPublicType } from "@dust-tt/client";
import type { MessageTemporaryState } from "../types";
import { UserMessage } from "./UserMessage";
import { AgentMessage } from "./AgentMessage";

type Props = {
  conversation?: ConversationPublicType;
  streamingState: MessageTemporaryState | null;
};

type MessageItem = {
  key: string;
  type: "user_message" | "agent_message";
  message: unknown;
  isStreaming: boolean;
  streamingState: MessageTemporaryState | null;
};

export const MessageList = memo(function MessageList({
  conversation,
  streamingState,
}: Props) {
  const messages: MessageItem[] = [];

  if (conversation?.content) {
    for (const versions of conversation.content) {
      const latest = versions[versions.length - 1];
      if (!latest) continue;

      const isStreamingThis =
        latest.type === "agent_message" &&
        streamingState?.message.sId === latest.sId;

      messages.push({
        key: latest.sId,
        type: latest.type as "user_message" | "agent_message",
        message: isStreamingThis ? streamingState.message : latest,
        isStreaming: isStreamingThis,
        streamingState: isStreamingThis ? streamingState : null,
      });
    }
  }

  // Reverse for inverted FlatList (newest at bottom)
  const invertedMessages = [...messages].reverse();

  return (
    <FlatList
      data={invertedMessages}
      inverted
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => (
        <View style={styles.messageWrapper}>
          {item.type === "user_message" ? (
            <UserMessage message={item.message as never} />
          ) : (
            <AgentMessage
              message={item.message as never}
              streamingState={item.streamingState}
            />
          )}
        </View>
      )}
      contentContainerStyle={styles.list}
    />
  );
});

const styles = StyleSheet.create({
  list: {
    padding: 16,
    paddingBottom: 8,
  },
  messageWrapper: {
    marginBottom: 12,
  },
});
