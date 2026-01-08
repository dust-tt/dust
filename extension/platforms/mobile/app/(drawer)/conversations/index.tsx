import type { ConversationWithoutContentPublicType } from "@dust-tt/client";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { ConversationList } from "@/components/ConversationList";
import { useConversations } from "@/hooks/useConversations";

export default function ConversationsScreen() {
  const router = useRouter();

  const {
    conversations,
    isConversationsLoading,
    isConversationsError,
    mutateConversations,
  } = useConversations();

  const handleSelectConversation = (
    conversation: ConversationWithoutContentPublicType
  ) => {
    router.push(`/conversations/${conversation.sId}`);
  };

  return (
    <View className="flex-1 bg-background">
      <ConversationList
        conversations={conversations}
        isLoading={isConversationsLoading}
        error={isConversationsError?.message ?? null}
        errorType={isConversationsError?.type ?? null}
        onRefresh={() => mutateConversations()}
        onSelect={handleSelectConversation}
      />
    </View>
  );
}
