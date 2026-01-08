import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { colors } from "@/lib/colors";
import type { ConversationWithoutContent } from "@/lib/types/conversations";

interface ConversationListProps {
  conversations: ConversationWithoutContent[];
  isLoading: boolean;
  error: string | null;
  errorType: string | null;
  onRefresh: () => Promise<void>;
  onSelect: (conversation: ConversationWithoutContent) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface ConversationItemProps {
  conversation: ConversationWithoutContent;
  onPress: () => void;
}

function ConversationItem({ conversation, onPress }: ConversationItemProps) {
  const displayTitle = conversation.title || "New conversation";
  const timeAgo = formatRelativeTime(
    conversation.updated ?? conversation.created
  );

  return (
    <Pressable
      className="py-3.5 px-4 active:bg-gray-100 dark:active:bg-gray-800"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3">
        {/* Unread indicator */}
        <View className="w-2 items-center">
          {conversation.unread && (
            <View className="w-2 h-2 rounded-full bg-blue-500" />
          )}
        </View>

        {/* Title */}
        <Text
          variant={conversation.unread ? "label-base" : "copy-base"}
          className="flex-1"
          numberOfLines={1}
        >
          {displayTitle}
        </Text>

        {/* Time */}
        <Text variant="copy-sm" className="text-muted-foreground">
          {timeAgo}
        </Text>

        {/* Chevron */}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.gray[400]}
        />
      </View>
    </Pressable>
  );
}

function EmptyState({ type }: { type: "empty" | "error" | "plan" }) {
  const config = {
    empty: {
      icon: "chatbubbles-outline" as const,
      title: "No conversations",
      description: "Start a conversation on dust.tt",
    },
    error: {
      icon: "alert-circle-outline" as const,
      title: "Couldn't load conversations",
      description: "Pull down to try again",
    },
    plan: {
      icon: "lock-closed-outline" as const,
      title: "Plan required",
      description: "This workspace needs a paid plan",
    },
  };

  const { icon, title, description } = config[type];

  return (
    <View className="flex-1 items-center justify-center p-8">
      <View className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mb-4">
        <Ionicons name={icon} size={28} color={colors.gray[400]} />
      </View>
      <Text variant="heading-lg" className="text-center mb-1">
        {title}
      </Text>
      <Text variant="copy-sm" className="text-muted-foreground text-center">
        {description}
      </Text>
    </View>
  );
}

function ItemSeparator() {
  return (
    <View className="ml-9 h-px bg-gray-100 dark:bg-gray-800" />
  );
}

export function ConversationList({
  conversations,
  isLoading,
  error,
  errorType,
  onRefresh,
  onSelect,
}: ConversationListProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  // Loading state
  if (isLoading && conversations.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner size="lg" variant="highlight" />
      </View>
    );
  }

  // Plan required error
  if (errorType === "workspace_can_use_product_required_error") {
    return <EmptyState type="plan" />;
  }

  // Generic error
  if (error && conversations.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <EmptyState type="error" />
        <Button
          variant="outline"
          size="sm"
          onPress={onRefresh}
          className="mt-4"
        >
          <Text>Try again</Text>
        </Button>
      </View>
    );
  }

  // Empty state
  if (conversations.length === 0) {
    return <EmptyState type="empty" />;
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.sId}
      renderItem={({ item }) => (
        <ConversationItem conversation={item} onPress={() => onSelect(item)} />
      )}
      ItemSeparatorComponent={ItemSeparator}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.blue[500]}
        />
      }
      contentContainerStyle={{ flexGrow: 1 }}
    />
  );
}
