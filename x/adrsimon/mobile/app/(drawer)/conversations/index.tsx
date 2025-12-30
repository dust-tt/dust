import { useRouter } from "expo-router";
import { View } from "react-native";

import { ConversationList } from "@/components/ConversationList";
import { useAuth } from "@/contexts/AuthContext";
import { useConversations } from "@/hooks/useConversations";
import type { ConversationWithoutContent } from "@/lib/types/conversations";

export default function ConversationsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const { conversations, isLoading, error, errorType, refresh } =
    useConversations(user?.dustDomain, user?.selectedWorkspace);

  const handleSelectConversation = (
    conversation: ConversationWithoutContent
  ) => {
    router.push(`/conversations/${conversation.sId}`);
  };

  return (
    <View className="flex-1 bg-background">
      <ConversationList
        conversations={conversations}
        isLoading={isLoading}
        error={error}
        errorType={errorType}
        onRefresh={refresh}
        onSelect={handleSelectConversation}
      />
    </View>
  );
}
