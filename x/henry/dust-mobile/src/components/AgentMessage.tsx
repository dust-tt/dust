import React, { memo } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import Markdown from "react-native-markdown-display";
import type { AgentMessagePublicType } from "@dust-tt/client";
import type { MessageTemporaryState } from "../types";
import { ActionDisplay } from "./ActionDisplay";

type Props = {
  message: AgentMessagePublicType;
  streamingState: MessageTemporaryState | null;
};

export const AgentMessage = memo(function AgentMessage({
  message,
  streamingState,
}: Props) {
  const agentState = streamingState?.agentState;
  const content = message.content || "";
  const hasActions = message.actions && message.actions.length > 0;

  return (
    <View style={styles.container}>
      {/* Agent name */}
      <Text style={styles.agentName}>
        {message.configuration.name}
      </Text>

      {/* Thinking indicator */}
      {agentState === "thinking" && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.statusText}>Thinking...</Text>
        </View>
      )}

      {/* Actions */}
      {hasActions &&
        message.actions.map((action, idx) => (
          <ActionDisplay
            key={`action-${idx}`}
            action={action as unknown as React.ComponentProps<typeof ActionDisplay>["action"]}
            isActive={agentState === "acting"}
          />
        ))}

      {/* Acting indicator (when no content yet) */}
      {agentState === "acting" && !content && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.statusText}>Working...</Text>
        </View>
      )}

      {/* Content */}
      {content ? (
        <View style={styles.contentContainer}>
          <Markdown style={markdownStyles}>{content}</Markdown>
          {agentState === "writing" && (
            <View style={styles.cursor} />
          )}
        </View>
      ) : null}

      {/* Error state */}
      {message.status === "failed" && message.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{message.error.message}</Text>
        </View>
      )}

      {/* Cancelled state */}
      {message.status === "cancelled" && (
        <Text style={styles.cancelledText}>Generation cancelled</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
    maxWidth: "90%",
  },
  agentName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  contentContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  cursor: {
    width: 2,
    height: 18,
    backgroundColor: "#000",
    marginLeft: 1,
    opacity: 0.7,
  },
  errorContainer: {
    backgroundColor: "#fee",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  errorText: {
    color: "#c53030",
    fontSize: 14,
  },
  cancelledText: {
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
    marginTop: 4,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: "#1a1a1a",
  },
  code_inline: {
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  code_block: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fence: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
