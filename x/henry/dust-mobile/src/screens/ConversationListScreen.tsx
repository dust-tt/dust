import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useConversations } from "../hooks/useConversations";
import { ConversationRow } from "../components/ConversationRow";
import { AgentPicker } from "../components/AgentPicker";
import type { ConversationListScreenProps } from "../navigation/types";
import type { LightAgentConfigurationType } from "@dust-tt/client";

export function ConversationListScreen({
  navigation,
}: ConversationListScreenProps) {
  const { conversations, isLoading, mutate } = useConversations();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const filteredConversations = conversations.filter((c) =>
    (c.title ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleNewConversation = useCallback(
    (agent: LightAgentConfigurationType) => {
      setShowAgentPicker(false);
      navigation.navigate("Conversation", { agentId: agent.sId });
    },
    [navigation]
  );

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      navigation.navigate("Conversation", { conversationId });
    },
    [navigation]
  );

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
      </View>

      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item.sId}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => handleOpenConversation(item.sId)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {isLoading ? "Loading..." : "No conversations yet"}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAgentPicker(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {showAgentPicker && (
        <AgentPicker
          onSelect={handleNewConversation}
          onClose={() => setShowAgentPicker(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  list: {
    paddingHorizontal: 16,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 64,
  },
  emptyText: {
    color: "#999",
    fontSize: 16,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "300",
  },
});
