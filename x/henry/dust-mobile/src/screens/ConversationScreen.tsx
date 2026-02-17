import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from "react-native";
import { useConversation } from "../hooks/useConversation";
import { useSubmitMessage } from "../hooks/useSubmitMessage";
import { MessageList } from "../components/MessageList";
import { InputBar } from "../components/InputBar";
import type { ConversationScreenProps } from "../navigation/types";
import type {
  AgentMentionType,
  ConversationPublicType,
} from "@dust-tt/client";

export function ConversationScreen({
  route,
  navigation,
}: ConversationScreenProps) {
  const { conversationId: initialConversationId, agentId } = route.params;
  const [conversationId, setConversationId] = useState(initialConversationId);
  const { conversation, mutate } = useConversation(conversationId);

  const handleConversationCreated = useCallback(
    (conv: ConversationPublicType) => {
      setConversationId(conv.sId);
      if (conv.title) {
        navigation.setOptions({ title: conv.title });
      }
    },
    [navigation]
  );

  const { submit, isSubmitting, streaming } = useSubmitMessage(
    conversationId,
    handleConversationCreated
  );

  // Set title from conversation
  useEffect(() => {
    if (conversation?.title) {
      navigation.setOptions({ title: conversation.title });
    }
  }, [conversation?.title, navigation]);

  // Revalidate on foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && conversationId) {
        mutate();
      }
    });
    return () => subscription.remove();
  }, [conversationId, mutate]);

  const handleSend = useCallback(
    (content: string, mentions: AgentMentionType[]) => {
      submit(content, mentions);
    },
    [submit]
  );

  const handleCancel = useCallback(() => {
    if (conversationId && streaming.state?.message.sId) {
      streaming.cancelStreaming(conversationId, streaming.state.message.sId);
    }
  }, [conversationId, streaming]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={88}
    >
      <View style={styles.container}>
        <MessageList
          conversation={conversation ?? undefined}
          streamingState={streaming.state}
        />
        <InputBar
          onSend={handleSend}
          onCancel={handleCancel}
          isStreaming={streaming.isStreaming}
          isSubmitting={isSubmitting}
          initialAgentId={agentId}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
