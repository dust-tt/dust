import React, { memo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

type ActionType = {
  toolName: string;
  functionCallName: string;
  status: string;
  params: Record<string, unknown>;
  [key: string]: unknown;
};

type Props = {
  action: ActionType;
  isActive: boolean;
};

function getActionLabel(action: ActionType): string {
  const name = action.functionCallName || action.toolName;
  // Format function_name to "Function name"
  return name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export const ActionDisplay = memo(function ActionDisplay({
  action,
  isActive,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const label = getActionLabel(action);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
      >
        {isActive ? (
          <ActivityIndicator size="small" color="#666" />
        ) : (
          <Text style={styles.checkmark}>✓</Text>
        )}
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.chevron}>{expanded ? "▼" : "▶"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.details}>
          <Text style={styles.detailText}>
            {JSON.stringify(action, null, 2).slice(0, 500)}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: "#f8f8f8",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    gap: 8,
  },
  checkmark: {
    fontSize: 14,
    color: "#4caf50",
  },
  label: {
    fontSize: 14,
    color: "#444",
    flex: 1,
  },
  chevron: {
    fontSize: 10,
    color: "#999",
  },
  details: {
    padding: 8,
    paddingTop: 0,
  },
  detailText: {
    fontSize: 12,
    color: "#666",
    fontFamily: "monospace",
  },
});
