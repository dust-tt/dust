import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

type Props = {
  name: string;
  onRemove: () => void;
};

export const MentionBadge = memo(function MentionBadge({
  name,
  onRemove,
}: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>@{name}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={8}>
        <Text style={styles.remove}>×</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8e8e8",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  text: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  remove: {
    fontSize: 18,
    color: "#999",
    marginLeft: 4,
    lineHeight: 18,
  },
});
