import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  View,
} from "react-native";

import { InputBarWithStop } from "@/components/InputBar";
import { SparkleAvatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentConfigurations } from "@/hooks/useAgentConfigurations";
import { useAgentMessageStream } from "@/hooks/useAgentMessageStream";
import { useConversation } from "@/hooks/useConversation";
import { useConversationEvents } from "@/hooks/useConversationEvents";
import { useSendMessage } from "@/hooks/useSendMessage";
import { colors } from "@/lib/colors";
import type { AgentMention } from "@/lib/services/api";
import { DustMarkdown, extractCitationsFromActions } from "@/lib/markdown";
import type {
  AgentMessage,
  CitationType,
  ContentFragment,
  Message,
  UserMessage,
} from "@/lib/types/conversations";

function UserMessageBubble({ message }: { message: UserMessage }) {
  return (
    <View className="flex-row justify-end mb-3 px-4">
      <View className="max-w-[85%] bg-muted-background dark:bg-muted-background-night rounded-2xl rounded-br-md px-4 py-3">
        <DustMarkdown>{message.content}</DustMarkdown>
      </View>
    </View>
  );
}

interface AgentMessageBubbleProps {
  message: AgentMessage;
  conversationId: string;
  dustDomain: string;
  workspaceId: string;
  onPress?: () => void;
  onStreamComplete?: () => void;
}

function AgentMessageBubble({
  message: initialMessage,
  conversationId,
  dustDomain,
  workspaceId,
  onPress,
  onStreamComplete,
}: AgentMessageBubbleProps) {
  // Each message manages its own streaming state
  const { message, isStreaming } = useAgentMessageStream(initialMessage, {
    conversationId,
    onStreamComplete: onStreamComplete ? () => onStreamComplete() : undefined,
  });

  const isLoading = message.status === "created" && !message.content;
  const hasError = message.status === "failed";

  const citations = useMemo(() => {
    if (!message.actions || message.actions.length === 0) {
      return undefined;
    }
    return extractCitationsFromActions(message.actions);
  }, [message.actions]);

  const handleCitationPress = (ref: string, citation: CitationType) => {
    if (citation.href) {
      Linking.openURL(citation.href);
    }
  };

  return (
    <View className="mb-4 px-4">
      <View className="flex-row items-center gap-2 mb-2">
        <SparkleAvatar
          size="xs"
          name={message.configuration.name}
          imageUrl={message.configuration.pictureUrl || undefined}
          isRounded={false}
        />
        <Text variant="label-sm" className="text-foreground flex-1">
          {message.configuration.name}
        </Text>
        {(isLoading || isStreaming) && <Spinner size="xs" variant="mono" />}
        {onPress && (
          <Pressable
            onPress={onPress}
            className="flex-row items-center gap-1"
            hitSlop={8}
          >
            <Text className="text-muted-foreground text-xs">View details</Text>
            <Ionicons
              name="chevron-forward"
              size={12}
              color={colors.gray[400]}
            />
          </Pressable>
        )}
      </View>

      <View>
        {hasError && message.error && (
          <Text className="text-rose-500 text-sm mb-2">
            {message.error.message}
          </Text>
        )}

        {message.content ? (
          <DustMarkdown
            citations={citations}
            onCitationPress={handleCitationPress}
            dustDomain={dustDomain}
            workspaceId={workspaceId}
          >
            {message.content}
          </DustMarkdown>
        ) : isLoading ? (
          <Text className="text-muted-foreground text-sm italic">
            Thinking...
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ContentFragmentBubble({ message }: { message: ContentFragment }) {
  return (
    <View className="mb-2 px-4">
      <View className="max-w-[85%] bg-golden-100 dark:bg-golden-900/30 rounded-2xl px-4 py-3 flex-row items-center gap-2">
        <Ionicons name="document-text" size={16} color={colors.golden[700]} />
        <View className="flex-1">
          <Text
            variant="label-sm"
            className="text-golden-800 dark:text-golden-300"
          >
            {message.title}
          </Text>
          {message.sourceUrl && (
            <Text
              variant="copy-xs"
              className="text-golden-600 dark:text-golden-400"
              numberOfLines={1}
            >
              {message.sourceUrl}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

interface MessageItemProps {
  message: Message;
  conversationId: string;
  dustDomain: string;
  workspaceId: string;
  onPressAgentMessage?: (message: AgentMessage) => void;
  onStreamComplete?: () => void;
}

function MessageItem({
  message,
  conversationId,
  dustDomain,
  workspaceId,
  onPressAgentMessage,
  onStreamComplete,
}: MessageItemProps) {
  if (message.visibility === "deleted") {
    return null;
  }

  switch (message.type) {
    case "user_message":
      return <UserMessageBubble message={message} />;
    case "agent_message":
      return (
        <AgentMessageBubble
          message={message}
          conversationId={conversationId}
          dustDomain={dustDomain}
          workspaceId={workspaceId}
          onPress={
            onPressAgentMessage ? () => onPressAgentMessage(message) : undefined
          }
          onStreamComplete={onStreamComplete}
        />
      );
    case "content_fragment":
      return <ContentFragmentBubble message={message} />;
  }
}

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center py-12">
      <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mb-3">
        <Ionicons
          name="chatbubble-outline"
          size={24}
          color={colors.gray[400]}
        />
      </View>
      <Text variant="copy-sm" className="text-muted-foreground">
        No messages yet
      </Text>
    </View>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <View className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 items-center justify-center mb-3">
        <Ionicons
          name="alert-circle-outline"
          size={24}
          color={colors.rose[500]}
        />
      </View>
      <Text variant="heading-base" className="text-center mb-1">
        Could not load conversation
      </Text>
      <Text variant="copy-sm" className="text-muted-foreground text-center">
        {error}
      </Text>
    </View>
  );
}

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(id) ? id[0] : id;
  const navigation = useNavigation();
  const router = useRouter();
  const { user } = useAuth();
  const flatListRef = useRef<FlatList<Message>>(null);

  const {
    conversation,
    isConversationLoading: isLoading,
    conversationError,
    mutateConversation,
  } = useConversation({ conversationId: conversationId ?? null });

  const error = conversationError?.message ?? null;

  // Subscribe to real-time conversation events (for messages from web/other devices)
  useConversationEvents({
    conversationId: conversationId ?? null,
    onNewMessage: useCallback(() => {
      void mutateConversation();
    }, [mutateConversation]),
  });

  const { agents, isAgentConfigurationsLoading: agentsLoading } =
    useAgentConfigurations();

  // Optimistic user message - shown immediately while waiting for API
  const [pendingUserMessage, setPendingUserMessage] = useState<UserMessage | null>(null);
  // Track if any message is currently streaming
  const [isStreaming, setIsStreaming] = useState(false);

  const handleStreamComplete = useCallback(() => {
    setPendingUserMessage(null);
    setIsStreaming(false);
    void mutateConversation();
  }, [mutateConversation]);

  const { isSending, sendMessageToConversation } = useSendMessage({});

  useEffect(() => {
    navigation.setOptions({
      title: conversation?.title ?? "Conversation",
      headerLeft: () => (
        <Pressable
          onPress={() => router.back()}
          className="mr-4 p-1"
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={colors.gray[50]} />
        </Pressable>
      ),
    });
  }, [navigation, router, conversation?.title]);

  const handleSubmit = useCallback(
    async (content: string, mentions: AgentMention[]) => {
      if (!conversationId || !user) return;

      // Create optimistic user message
      const optimisticMessage: UserMessage = {
        id: Date.now(),
        created: Date.now(),
        type: "user_message",
        sId: `pending-${Date.now()}`,
        visibility: "visible",
        version: 0,
        user: {
          sId: user.sId,
          fullName: user.fullName,
          image: user.image ?? null,
        },
        content,
      };

      setPendingUserMessage(optimisticMessage);
      setIsStreaming(true);

      // Scroll to bottom immediately
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);

      const result = await sendMessageToConversation(conversationId, content, mentions);

      // After message is sent, refresh to get the agent message
      // The agent message will handle its own streaming
      if (result) {
        setPendingUserMessage(null);
        await mutateConversation();
      }
    },
    [conversationId, user, sendMessageToConversation, mutateConversation]
  );

  // Combine conversation messages with pending user message
  const messages = useMemo(() => {
    const baseMessages: Message[] = conversation?.content.flat() ?? [];
    const result: Message[] = [...baseMessages];

    // Add optimistic user message if present
    if (pendingUserMessage) {
      result.push(pendingUserMessage);
    }

    return result;
  }, [conversation?.content, pendingUserMessage]);

  // Loading state
  if (isLoading && !conversation) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner size="lg" variant="highlight" />
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View className="flex-1 bg-background">
        <ErrorState error={error} />
      </View>
    );
  }

  // Not found state
  if (!conversation) {
    return (
      <View className="flex-1 bg-background">
        <ErrorState error="Conversation not found" />
      </View>
    );
  }

  const handlePressAgentMessage = (message: AgentMessage) => {
    router.push(`/conversations/${conversationId}/message/${message.sId}`);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.sId}
        renderItem={({ item }) => (
          <MessageItem
            message={item}
            conversationId={conversationId ?? ""}
            dustDomain={user?.dustDomain ?? ""}
            workspaceId={user?.selectedWorkspace ?? ""}
            onPressAgentMessage={handlePressAgentMessage}
            onStreamComplete={handleStreamComplete}
          />
        )}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: 16,
          flexGrow: 1,
        }}
        ListEmptyComponent={EmptyState}
        onContentSizeChange={() => {
          if (isStreaming || pendingUserMessage) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
      />
      <InputBarWithStop
        onSubmit={handleSubmit}
        isLoading={isSending}
        isGenerating={isStreaming}
        placeholder="Send a message..."
        agents={agents}
        agentsLoading={agentsLoading}
      />
    </KeyboardAvoidingView>
  );
}
