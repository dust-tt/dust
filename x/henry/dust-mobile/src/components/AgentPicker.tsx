import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { useAgentConfigurations } from "../hooks/useAgentConfigurations";
import type { LightAgentConfigurationType } from "@dust-tt/client";

type Props = {
  onSelect: (agent: LightAgentConfigurationType) => void;
  onClose: () => void;
};

export function AgentPicker({ onSelect, onClose }: Props) {
  const { agents, isLoading } = useAgentConfigurations();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q)
    );
  }, [agents, search]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Select an agent</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search agents..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#999"
          autoFocus
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.sId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => onSelect(item)}
            >
              <Text style={styles.agentName}>@{item.name}</Text>
              {item.description && (
                <Text style={styles.agentDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {isLoading ? "Loading agents..." : "No agents found"}
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  closeText: {
    fontSize: 16,
    color: "#666",
  },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
  },
  agentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  agentDesc: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    paddingTop: 32,
    fontSize: 16,
  },
});
