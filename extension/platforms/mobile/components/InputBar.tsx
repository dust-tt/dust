import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";

import { SparkleAvatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import type { AgentMention } from "@/lib/services/api";
import type { LightAgentConfiguration } from "@/lib/types/conversations";
import { colors } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface MentionedAgent {
  id: string;
  name: string;
  startIndex: number;
  endIndex: number;
}

interface InputBarProps {
  onSubmit: (message: string, mentions: AgentMention[]) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  autoFocus?: boolean;
  agents?: LightAgentConfiguration[];
  agentsLoading?: boolean;
}

export function InputBar({
  onSubmit,
  placeholder = "Ask anything...",
  disabled = false,
  isLoading = false,
  autoFocus = false,
  agents = [],
  agentsLoading = false,
}: InputBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(
    null
  );
  const [mentionedAgents, setMentionedAgents] = useState<MentionedAgent[]>([]);
  const inputRef = useRef<TextInput>(null);

  // Filter agents based on mention query
  const filteredAgents = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return agents
      .filter((agent) => agent.name.toLowerCase().includes(query))
      .slice(0, 5);
  }, [agents, mentionQuery]);

  const showMentionDropdown =
    mentionQuery !== null && filteredAgents.length > 0;

  const handleTextChange = useCallback((text: string) => {
    setInputValue(text);

    // Detect @ mentions
    const lastAtIndex = text.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = text.substring(lastAtIndex + 1);
      // Check if there's a space after the @, which would end the mention
      const spaceIndex = textAfterAt.indexOf(" ");

      if (spaceIndex === -1) {
        // Still typing the mention
        setMentionQuery(textAfterAt);
        setMentionStartIndex(lastAtIndex);
      } else {
        // Mention ended, clear the dropdown
        setMentionQuery(null);
        setMentionStartIndex(null);
      }
    } else {
      setMentionQuery(null);
      setMentionStartIndex(null);
    }
  }, []);

  const handleSelectAgent = useCallback(
    (agent: LightAgentConfiguration) => {
      if (mentionStartIndex === null) return;

      // Replace the @query with @agentName
      const beforeMention = inputValue.substring(0, mentionStartIndex);
      const afterMention = inputValue.substring(
        mentionStartIndex + 1 + (mentionQuery?.length ?? 0)
      );
      const mentionText = `@${agent.name}`;
      const newText = `${beforeMention}${mentionText} ${afterMention}`;

      // Track this mention
      const newMention: MentionedAgent = {
        id: agent.sId,
        name: agent.name,
        startIndex: mentionStartIndex,
        endIndex: mentionStartIndex + mentionText.length,
      };

      setMentionedAgents((prev) => [...prev, newMention]);
      setInputValue(newText);
      setMentionQuery(null);
      setMentionStartIndex(null);

      // Keep focus on input
      inputRef.current?.focus();
    },
    [inputValue, mentionQuery, mentionStartIndex]
  );

  const handleSubmit = useCallback(() => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue || disabled || isLoading) {
      return;
    }

    // Extract mentions from the final text
    const mentions: AgentMention[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(trimmedValue)) !== null) {
      const mentionName = match[1];
      const agent = agents.find(
        (a) => a.name.toLowerCase() === mentionName.toLowerCase()
      );
      if (agent) {
        mentions.push({ configurationId: agent.sId });
      }
    }

    // Also include any tracked mentions that might have special characters
    for (const mentioned of mentionedAgents) {
      if (!mentions.some((m) => m.configurationId === mentioned.id)) {
        mentions.push({ configurationId: mentioned.id });
      }
    }

    onSubmit(trimmedValue, mentions);
    setInputValue("");
    setMentionedAgents([]);
    setMentionQuery(null);
    setMentionStartIndex(null);
    Keyboard.dismiss();
  }, [inputValue, disabled, isLoading, onSubmit, agents, mentionedAgents]);

  const canSubmit = inputValue.trim().length > 0 && !disabled && !isLoading;

  return (
    <View className="relative">
      {/* Mention dropdown */}
      {showMentionDropdown && (
        <View
          className={cn(
            "absolute bottom-full left-0 right-0 mx-3 mb-1",
            "bg-background dark:bg-gray-900",
            "border-border border dark:border-gray-700",
            "rounded-xl shadow-lg",
            "max-h-96 overflow-hidden"
          )}
        >
          {agentsLoading ? (
            <View className="items-center py-4">
              <Spinner size="sm" variant="mono" />
            </View>
          ) : (
            <FlatList
              data={filteredAgents}
              keyExtractor={(item) => item.sId}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelectAgent(item)}
                  className={cn(
                    "flex-row items-center gap-3 px-4 py-3",
                    "active:bg-gray-100 dark:active:bg-gray-800"
                  )}
                >
                  <SparkleAvatar
                    size="xs"
                    name={item.name}
                    imageUrl={item.pictureUrl ?? undefined}
                    isRounded={false}
                  />
                  <View className="flex-1">
                    <Text variant="label-sm" className="text-foreground">
                      {item.name}
                    </Text>
                    {item.description && (
                      <Text
                        variant="copy-xs"
                        className="text-muted-foreground"
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>
                    )}
                  </View>
                </Pressable>
              )}
              ItemSeparatorComponent={() => (
                <View className="bg-border h-px dark:bg-gray-700" />
              )}
            />
          )}
        </View>
      )}

      {/* Input bar */}
      <View
        className={cn(
          "mx-3 mb-2 flex-row items-end gap-2 p-3",
          // bg should have alpha transparent to allow for mention dropdown shadow
          "bg-background/100",
          "rounded-2xl"
        )}
      >
        <View
          className={cn(
            "flex-1 flex-row items-end",
            "bg-background dark:bg-gray-900",
            "rounded-2xl",
            "border-border border dark:border-gray-700",
            "max-h-[120px] min-h-[44px]"
          )}
        >
          <TextInput
            ref={inputRef}
            className={cn(
              "flex-1 px-4 py-3",
              "text-foreground text-base dark:text-gray-50",
              Platform.select({
                ios: "leading-5",
                android: "leading-6",
              })
            )}
            placeholder={placeholder}
            placeholderTextColor={colors.gray[500]}
            value={inputValue}
            onChangeText={handleTextChange}
            onSubmitEditing={handleSubmit}
            multiline
            maxLength={32000}
            editable={!disabled && !isLoading}
            autoFocus={autoFocus}
            returnKeyType="default"
            blurOnSubmit={false}
          />
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            "h-11 w-11 items-center justify-center rounded-full",
            canSubmit
              ? "bg-blue-500 active:bg-blue-600"
              : "bg-gray-200 dark:bg-gray-700"
          )}
          hitSlop={8}
        >
          {isLoading ? (
            <Spinner size="sm" variant="mono" />
          ) : (
            <Ionicons
              name="arrow-up"
              size={20}
              color={canSubmit ? colors.white : colors.gray[400]}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

interface InputBarWithStopProps extends InputBarProps {
  isGenerating?: boolean;
  onStop?: () => void;
}

export function InputBarWithStop({
  isGenerating = false,
  onStop,
  ...props
}: InputBarWithStopProps) {
  return (
    <View>
      {isGenerating && onStop && (
        <View className="items-center pb-2">
          <Pressable
            onPress={onStop}
            className={cn(
              "flex-row items-center gap-2 px-4 py-2",
              "bg-muted-background dark:bg-gray-800",
              "rounded-full",
              "border-border border dark:border-gray-700",
              "active:bg-gray-100 dark:active:bg-gray-700",
              "shadow-sm shadow-black/5"
            )}
          >
            <Ionicons name="stop" size={14} color={colors.gray[500]} />
            <Text variant="copy-sm" className="text-muted-foreground">
              Stop generating
            </Text>
          </Pressable>
        </View>
      )}
      <InputBar {...props} />
    </View>
  );
}
