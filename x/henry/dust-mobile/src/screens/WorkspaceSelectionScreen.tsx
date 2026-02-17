import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthContext } from "../context/AuthContext";
import type { WorkspaceType } from "@dust-tt/client";

export function WorkspaceSelectionScreen() {
  const { user, handleSelectWorkspace, handleLogout } = useAuthContext();
  const workspaces = user?.workspaces ?? [];

  const renderItem = ({ item }: { item: WorkspaceType }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => handleSelectWorkspace(item)}
    >
      <Text style={styles.workspaceName}>{item.name}</Text>
      {item.ssoEnforced && <Text style={styles.ssoBadge}>SSO</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select workspace</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.sId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  logoutText: {
    fontSize: 15,
    color: "#666",
  },
  list: {
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    marginBottom: 8,
  },
  workspaceName: {
    fontSize: 17,
    fontWeight: "500",
    flex: 1,
  },
  ssoBadge: {
    fontSize: 12,
    color: "#666",
    backgroundColor: "#e0e0e0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
});
