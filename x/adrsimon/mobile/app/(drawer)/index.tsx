import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { InputBar } from "@/components/InputBar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentConfigurations } from "@/hooks/useAgentConfigurations";
import { useSendMessage } from "@/hooks/useSendMessage";
import { colors } from "@/lib/colors";
import type { AgentMention } from "@/lib/services/api";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const firstName = user?.fullName?.split(" ")[0] || "there";

  const { agents, isLoading: agentsLoading } = useAgentConfigurations();

  const handleConversationCreated = useCallback(
    (conversationId: string) => {
      router.push(`/conversations/${conversationId}`);
    },
    [router]
  );

  const { isSending, createConversationAndSend } = useSendMessage({
    onConversationCreated: handleConversationCreated,
  });

  const handleSubmit = useCallback(
    async (content: string, mentions: AgentMention[]) => {
      await createConversationAndSend(content, mentions);
    },
    [createConversationAndSend]
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View className="flex-1 px-6">
        <View className="flex-1 justify-center items-center">
          {/* Icon */}
          <View className="w-20 h-20 rounded-2xl bg-blue-500/10 items-center justify-center mb-6">
            <Ionicons name="sparkles" size={40} color={colors.blue[500]} />
          </View>

          {/* Welcome text */}
          <Text variant="heading-3xl" className="text-center mb-2">
            Welcome, {firstName}
          </Text>
          <Text
            variant="copy-base"
            className="text-muted-foreground text-center mb-8"
          >
            Your AI assistant is ready to help
          </Text>

          {/* CTA Button */}
          <Button
            variant="highlight"
            size="md"
            onPress={() => router.push("/conversations")}
            className="w-full max-w-xs"
          >
            <Ionicons
              name="chatbubbles-outline"
              size={20}
              color={colors.white}
            />
            <Text>View Conversations</Text>
          </Button>
        </View>
      </View>
      <InputBar
        onSubmit={handleSubmit}
        isLoading={isSending}
        placeholder="Start a new conversation..."
        agents={agents}
        agentsLoading={agentsLoading}
      />
    </KeyboardAvoidingView>
  );
}
