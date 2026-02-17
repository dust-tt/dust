import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { UserMessageType } from "@dust-tt/client";

type Props = {
  message: UserMessageType;
};

export const UserMessage = memo(function UserMessage({ message }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.text}>{message.content}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
  },
  bubble: {
    backgroundColor: "#000",
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "80%",
  },
  text: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
  },
});
