import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

type ConversationSummary = {
  sId: string;
  title: string | null;
  created: number;
};

type Props = {
  conversation: ConversationSummary;
  onPress: () => void;
};

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export const ConversationRow = memo(function ConversationRow({
  conversation,
  onPress,
}: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {conversation.title || "New conversation"}
        </Text>
        <Text style={styles.date}>{formatDate(conversation.created)}</Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
  },
  content: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
    marginRight: 12,
  },
  date: {
    fontSize: 13,
    color: "#999",
  },
});
