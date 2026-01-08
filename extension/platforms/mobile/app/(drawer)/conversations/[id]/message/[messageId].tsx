import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { SparkleAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/contexts/AuthContext";
import { useConversation } from "@/hooks/useConversation";
import { colors } from "@/lib/colors";
import { DustMarkdown } from "@/lib/markdown";
import type {
  AgentAction,
  AgentMessage,
  ParsedContentItem,
} from "@/lib/types/conversations";
import {
  formatDurationString,
  formatRelativeTime,
} from "@/lib/utils/timestamps";

// Tool name constants matching the front app
const SEARCH_TOOL_NAME = "semantic_search";
const WEBSEARCH_TOOL_NAME = "websearch";
const WEBBROWSER_TOOL_NAME = "webbrowser";
const QUERY_TABLES_TOOL_NAME = "query_tables";
const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";
const PROCESS_TOOL_NAME = "extract_information_from_documents";
const FILESYSTEM_LIST_TOOL_NAME = "list";
const FILESYSTEM_FIND_TOOL_NAME = "find";

type ActionInfo = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
};

function getActionInfo(action: AgentAction): ActionInfo {
  const toolName = action.toolName;
  const serverName = action.internalMCPServerName;

  // Search tools
  if (toolName === SEARCH_TOOL_NAME) {
    return { icon: "search", label: "Searching data", color: colors.blue[500] };
  }

  // Web search
  if (toolName === WEBSEARCH_TOOL_NAME || serverName === "brave_search") {
    return {
      icon: "globe",
      label: "Searching the web",
      color: colors.green[500],
    };
  }

  // Web browser
  if (toolName === WEBBROWSER_TOOL_NAME) {
    return {
      icon: "open-outline",
      label: "Browsing the web",
      color: colors.green[500],
    };
  }

  // File system operations
  if (
    toolName === FILESYSTEM_LIST_TOOL_NAME ||
    toolName === FILESYSTEM_FIND_TOOL_NAME
  ) {
    return {
      icon: "folder-open",
      label: "Browsing files",
      color: colors.golden[500],
    };
  }

  // Data extraction
  if (toolName === PROCESS_TOOL_NAME) {
    return {
      icon: "scan",
      label: "Extracting data",
      color: colors.violet[500],
    };
  }

  // Database queries
  if (
    toolName === QUERY_TABLES_TOOL_NAME ||
    toolName === EXECUTE_DATABASE_QUERY_TOOL_NAME
  ) {
    return { icon: "grid", label: "Querying tables", color: colors.blue[400] };
  }

  // Include data (by server name)
  if (serverName === "include_data") {
    return {
      icon: "document-text",
      label: "Including data",
      color: colors.golden[500],
    };
  }

  // Run agent
  if (serverName === "run_agent") {
    return {
      icon: "person",
      label: "Running agent",
      color: colors.violet[400],
    };
  }

  // Reasoning
  if (serverName === "reasoning") {
    return { icon: "bulb", label: "Reasoning", color: colors.golden[500] };
  }

  // Fallback: use function call name or tool name
  const displayName = action.functionCallName
    ? action.functionCallName
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase())
    : action.toolName
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

  return { icon: "flash", label: displayName, color: colors.gray[500] };
}

function getOutputText(action: AgentAction): string | null {
  if (!action.output || action.output.length === 0) {
    return null;
  }

  const texts: string[] = [];
  for (const output of action.output) {
    if (output.type === "text" && output.text) {
      texts.push(output.text);
    } else if (output.type === "resource" && output.resource?.text) {
      texts.push(output.resource.text);
    }
  }

  return texts.length > 0 ? texts.join("\n\n") : null;
}

interface ActionItemProps {
  action: AgentAction;
}

function ActionItem({ action }: ActionItemProps) {
  const { icon, label, color } = getActionInfo(action);
  const isRunning = action.status === "running" || action.status === "pending";

  return (
    <View className="flex-row justify-center items-center gap-2">
      <View className="w-8 h-8 bg-muted-background rounded-lg items-center justify-center mt-0.5">
        {isRunning ? (
          <Spinner size="xs" variant="mono" />
        ) : (
          <Ionicons name={icon} size={16} color={color} />
        )}
      </View>

      <View className="flex-1">
        <Text variant="label-sm">{label}</Text>
      </View>
    </View>
  );
}

interface StepSectionProps {
  stepNumber: number;
  entries: ParsedContentItem[];
  dustDomain?: string;
  workspaceId?: string;
}

function StepSection({
  stepNumber,
  entries,
  dustDomain,
  workspaceId,
}: StepSectionProps) {
  const actions = entries.filter((e) => e.kind === "action");
  const reasoning = entries.filter((e) => e.kind === "reasoning");

  return (
    <View className="mb-4">
      <Text variant="label-xs" className="text-muted-foreground uppercase mb-4">
        Step {stepNumber}
      </Text>

      {reasoning.length > 0 && (
        <View className="mb-2 rounded-xl bg-muted-background dark:bg-muted-background-night">
          {reasoning.map((entry, idx) => (
            <View key={`reasoning-${idx}`}>
              {entry.kind === "reasoning" && (
                <DustMarkdown dustDomain={dustDomain} workspaceId={workspaceId}>
                  {entry.content}
                </DustMarkdown>
              )}
            </View>
          ))}
        </View>
      )}

      <View>
        {actions.map((entry) => {
          if (entry.kind === "action") {
            return (
              <ActionItem
                key={`action-${entry.action.id}`}
                action={entry.action}
              />
            );
          }
          return null;
        })}
      </View>
    </View>
  );
}

export default function MessageDetailScreen() {
  const { id, messageId } = useLocalSearchParams<{
    id: string;
    messageId: string;
  }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { conversation, isLoading, error } = useConversation(
    user?.dustDomain,
    user?.selectedWorkspace,
    id
  );

  useEffect(() => {
    navigation.setOptions({
      title: "",
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
  }, [navigation, router]);

  const message = useMemo(() => {
    return conversation?.content.flat().find((m) => m.sId === messageId);
  }, [conversation, messageId]);

  const agentMessage =
    message?.type === "agent_message" ? (message as AgentMessage) : null;

  const handleCopy = async () => {
    if (agentMessage?.content) {
      await Clipboard.setStringAsync(agentMessage.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading && !conversation) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner size="lg" variant="highlight" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <View className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 items-center justify-center mb-3">
          <Ionicons
            name="alert-circle-outline"
            size={24}
            color={colors.rose[500]}
          />
        </View>
        <Text variant="heading-base" className="text-center mb-1">
          Something went wrong
        </Text>
        <Text variant="copy-sm" className="text-muted-foreground text-center">
          {error}
        </Text>
      </View>
    );
  }

  // Not found state
  if (!agentMessage) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center mb-3">
          <Ionicons
            name="chatbubble-outline"
            size={24}
            color={colors.gray[400]}
          />
        </View>
        <Text variant="heading-base" className="text-center mb-1">
          Message not found
        </Text>
        <Text variant="copy-sm" className="text-muted-foreground text-center">
          This message may have been deleted.
        </Text>
      </View>
    );
  }

  const hasCompleted = agentMessage.completedTs !== null;
  const completedInMs = hasCompleted
    ? agentMessage.completedTs! - agentMessage.created
    : null;

  const steps = agentMessage.parsedContents ?? {};
  const sortedSteps = Object.entries(steps)
    .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));

  const nbActions = agentMessage.actions?.length ?? 0;
  const isRunning = agentMessage.status === "created";
  const hasFailed = agentMessage.status === "failed";

  // Build summary text
  const summaryParts: string[] = [];
  if (hasCompleted && completedInMs !== null) {
    summaryParts.push(formatDurationString(completedInMs));
  }
  if (nbActions > 0) {
    summaryParts.push(`${nbActions} ${nbActions === 1 ? "tool" : "tools"}`);
  }
  if (sortedSteps.length > 0) {
    summaryParts.push(
      `${sortedSteps.length} ${sortedSteps.length === 1 ? "step" : "steps"}`
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <View className="flex-row items-center gap-3">
            <SparkleAvatar
              size="md"
              name={agentMessage.configuration.name}
              imageUrl={agentMessage.configuration.pictureUrl || undefined}
              isRounded={false}
            />
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text variant="heading-base">
                  {agentMessage.configuration.name}
                </Text>
                {isRunning && <Spinner size="xs" variant="highlight" />}
              </View>
              <Text variant="copy-xs" className="text-muted-foreground">
                {formatRelativeTime(agentMessage.created)}
                {summaryParts.length > 0 &&
                  !isRunning &&
                  ` · ${summaryParts.join(" · ")}`}
              </Text>
            </View>
          </View>

          {/* Status badges */}
          {(isRunning || hasFailed) && (
            <View className="mt-2">
              {isRunning && (
                <View className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 self-start">
                  <Text
                    variant="copy-xs"
                    className="text-blue-600 dark:text-blue-400"
                  >
                    Generating response...
                  </Text>
                </View>
              )}
              {hasFailed && (
                <View className="px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-900/20 self-start">
                  <Text
                    variant="copy-xs"
                    className="text-rose-600 dark:text-rose-400"
                  >
                    Generation failed
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Content */}
        <View className="px-4 pt-4">
          {/* Response */}
          {agentMessage.content && (
            <View className="mb-6">
              <DustMarkdown
                dustDomain={user?.dustDomain}
                workspaceId={user?.selectedWorkspace ?? undefined}
              >
                {agentMessage.content}
              </DustMarkdown>
            </View>
          )}

          {/* Steps breakdown */}
          {sortedSteps.length > 0 && (
            <View className="mb-6">
              <Text
                variant="label-xs"
                className="text-muted-foreground mb-4 uppercase tracking-wide"
              >
                How it worked
              </Text>
              {sortedSteps.map(([step, entries]) => (
                <StepSection
                  key={step}
                  stepNumber={parseInt(step, 10)}
                  entries={entries}
                  dustDomain={user?.dustDomain}
                  workspaceId={user?.selectedWorkspace ?? undefined}
                />
              ))}
            </View>
          )}

          {/* Fallback: Chain of thought */}
          {sortedSteps.length === 0 && agentMessage.chainOfThought && (
            <View className="mb-6">
              <Text
                variant="label-xs"
                className="text-muted-foreground mb-3 uppercase tracking-wide"
              >
                Reasoning
              </Text>
              <View className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                <DustMarkdown
                  dustDomain={user?.dustDomain}
                  workspaceId={user?.selectedWorkspace ?? undefined}
                >
                  {agentMessage.chainOfThought}
                </DustMarkdown>
              </View>
            </View>
          )}

          {/* Fallback: Actions list */}
          {sortedSteps.length === 0 && nbActions > 0 && (
            <View className="mb-6">
              <Text
                variant="label-xs"
                className="text-muted-foreground mb-4 uppercase tracking-wide"
              >
                Tools used
              </Text>
              {agentMessage.actions.map((action) => (
                <ActionItem key={action.id} action={action} />
              ))}
            </View>
          )}

          {/* Error display */}
          {agentMessage.error && (
            <View className="mb-6">
              <View className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30">
                <View className="flex-row items-center gap-2 mb-1">
                  <Ionicons
                    name="alert-circle"
                    size={14}
                    color={colors.rose[500]}
                  />
                  <Text
                    variant="label-sm"
                    className="text-rose-700 dark:text-rose-400"
                  >
                    {agentMessage.error.code}
                  </Text>
                </View>
                <Text
                  variant="copy-sm"
                  className="text-rose-600 dark:text-rose-300"
                >
                  {agentMessage.error.message}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      {agentMessage.content && !isRunning && (
        <View className="absolute bottom-0 left-0 right-0 bg-background border-t border-gray-100 dark:border-gray-800 px-4 py-3 pb-8">
          <Button
            variant="outline"
            size="sm"
            onPress={handleCopy}
            className="w-full"
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={16}
              color={copied ? colors.green[500] : colors.gray[500]}
            />
            <Text>{copied ? "Copied!" : "Copy response"}</Text>
          </Button>
        </View>
      )}
    </View>
  );
}
