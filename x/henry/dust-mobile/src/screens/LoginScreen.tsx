import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthContext } from "../context/AuthContext";

export function LoginScreen() {
  const { handleLogin, authError } = useAuthContext();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Dust</Text>
        <Text style={styles.subtitle}>Your AI assistant</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => handleLogin()}
        >
          <Text style={styles.buttonText}>Sign in</Text>
        </TouchableOpacity>

        {authError && <Text style={styles.error}>{authError}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 48,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    marginBottom: 48,
  },
  button: {
    backgroundColor: "#000",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  error: {
    color: "#e53e3e",
    marginTop: 16,
    textAlign: "center",
  },
});
