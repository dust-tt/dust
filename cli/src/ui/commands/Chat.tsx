import type {
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  CreateConversationResponseType,
  GetAgentConfigurationsResponseType,
} from "@dust-tt/client";
import { readdir, stat } from "fs/promises";
import { Box, Text, useInput, useStdout } from "ink";
import open from "open";
import path from "path";
import type { FC } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useFileSystemServer } from "../../mcp/servers/fsServer.js";
import AuthService from "../../utils/authService.js";
import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import type { FileInfo } from "../../utils/fileHandling.js";
import {
  formatFileSize,
  getFileExtension,
  isImageFile,
  isSupportedFileType,
  validateAndGetFileInfo,
} from "../../utils/fileHandling.js";
import { useAgents } from "../../utils/hooks/use_agents.js";
import { useMe } from "../../utils/hooks/use_me.js";
import { clearTerminal } from "../../utils/terminal.js";
import { toolsCache } from "../../utils/toolsCache.js";
import AgentSelector from "../components/AgentSelector.js";
import type { ConversationItem, TimelineEntry } from "../components/Conversation.js";
import Conversation from "../components/Conversation.js";
import type { UploadedFile } from "../components/FileUpload.js";
import { FileUpload } from "../components/FileUpload.js";
import type { InlineSelectorItem } from "../components/InlineSelector.js";
import { createCommands } from "./types.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface CliChatProps {
  sId?: string;
  agentSearch?: string;
  conversationId?: string;
  autoAcceptEditsFlag?: boolean;
}

function getLastConversationItem<T extends ConversationItem>(
  items: ConversationItem[],
  type: T["type"]
): T | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === type) {
      return item as T;
    }
  }
  return null;
}

const formatInputs = (inputs: unknown): string => {
  if (!inputs) {
    return "";
  }
  if (typeof inputs === "string") {
    return inputs;
  }
  const str = JSON.stringify(inputs, null, 2);
  // Truncate long inputs
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
};

const ToolApprovalHeader: FC<{
  event: AgentActionSpecificEvent & { type: "tool_approve_execution" };
}> = ({ event }) => (
  <Box flexDirection="column">
    <Text color="blue" bold>
      Tool Execution Approval
    </Text>
    <Text>
      <Text bold>{event.metadata.toolName}</Text>
      <Text dimColor> from {event.metadata.mcpServerName}</Text>
    </Text>
    {event.inputs && (
      <Text dimColor>{formatInputs(event.inputs)}</Text>
    )}
  </Box>
);

const CliChat: FC<CliChatProps> = ({
  sId: requestedSId,
  agentSearch,
  conversationId,
  autoAcceptEditsFlag,
}) => {
  const [autoAcceptEdits, setAutoAcceptEdits] = useState(!!autoAcceptEditsFlag);
  const autoAcceptEditsRef = useRef(autoAcceptEdits);

  const [error, setError] = useState<string | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<AgentConfiguration | null>(
    null
  );
  const [isProcessingQuestion, setIsProcessingQuestion] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(conversationId ? conversationId : null);
  const [conversationItems, setConversationItems] = useState<
    ConversationItem[]
  >([]);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [userInput, setUserInput] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showCommandSelector, setShowCommandSelector] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [commandCursorPosition, setCommandCursorPosition] = useState(0);
  const [inlineSelector, setInlineSelector] = useState<{
    mode: "agent" | "conversation" | "file" | "tool_approval";
    items: InlineSelectorItem[];
    query: string;
    selectedIndex: number;
    currentPath?: string;
  } | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<AgentActionSpecificEvent | null>(null);
  const [approvalResolver, setApprovalResolver] = useState<
    ((approved: boolean) => void) | null
  >(null);
  const [pendingDiffApproval, setPendingDiffApproval] = useState<{
    originalContent: string;
    updatedContent: string;
    filePath: string;
  } | null>(null);
  const [diffApprovalResolver, setDiffApprovalResolver] = useState<
    ((approved: boolean) => void) | null
  >(null);
  const [pendingFiles, setPendingFiles] = useState<FileInfo[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [fileSystemInitialized, setFileSystemInitialized] = useState(false);
  const [fileSystemServerId, setFileSystemServerId] = useState<string | null>(
    null
  );
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [streamingAgentName, setStreamingAgentName] = useState<string | null>(
    null
  );
  const agentMessageCountRef = useRef(0);
  const pendingStaticItemRef = useRef<ConversationItem | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<string>("");
  const chainOfThoughtRef = useRef<string>("");
  const agentStateRef = useRef<"thinking" | "acting" | "writing">("thinking");
  const currentActionRef = useRef<{
    runningLabel: string;
    notificationLabel: string | null;
  } | null>(null);
  const timelineRef = useRef<TimelineEntry[]>([]);

  const [streamingAgentState, setStreamingAgentState] = useState<
    "thinking" | "acting" | "writing" | null
  >(null);
  const [streamingActionLabel, setStreamingActionLabel] = useState<
    string | null
  >(null);
  const [streamingTimeline, setStreamingTimeline] = useState<
    TimelineEntry[]
  >([]);

  const { stdout } = useStdout();

  const { me, isLoading: isMeLoading, error: meError } = useMe();

  // Import useAgents hook for agent search functionality
  const {
    allAgents,
    error: agentsError,
    isLoading: agentsIsLoading,
  } = useAgents();

  const triggerAgentSwitch = useCallback(() => {
    // Clear all input states before switching.
    setUserInput("");
    setCursorPosition(0);
    setShowCommandSelector(false);
    setCommandQuery("");
    setSelectedCommandIndex(0);
    setCommandCursorPosition(0);

    const items: InlineSelectorItem[] = (allAgents || []).map((agent) => ({
      id: agent.sId,
      label: agent.name,
      description: agent.description.split("\n")[0]?.slice(0, 60) || "",
    }));

    setInlineSelector({
      mode: "agent",
      items,
      query: "",
      selectedIndex: 0,
    });
  }, [allAgents]);

  const TOOL_APPROVAL_ITEMS: InlineSelectorItem[] = [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
  ];

  const LOW_STAKE_TOOL_APPROVAL_ITEMS: InlineSelectorItem[] = [
    { id: "approve", label: "Approve" },
    { id: "approve_and_cache", label: "Approve and don't ask again" },
    { id: "reject", label: "Reject" },
  ];

  const loadDirectoryItems = useCallback(
    async (dirPath: string): Promise<InlineSelectorItem[]> => {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const items: InlineSelectorItem[] = [];

      // Add parent directory navigation unless at root
      if (dirPath !== "/") {
        items.push({ id: path.dirname(dirPath), label: ".." });
      }

      const dirs: InlineSelectorItem[] = [];
      const supportedFiles: InlineSelectorItem[] = [];
      const unsupportedFiles: InlineSelectorItem[] = [];

      for (const entry of entries) {
        // Skip hidden files/dirs
        if (entry.name.startsWith(".")) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          dirs.push({ id: fullPath, label: `📁 ${entry.name}/` });
        } else if (entry.isFile()) {
          const ext = getFileExtension(entry.name);
          if (isSupportedFileType(ext)) {
            supportedFiles.push({ id: fullPath, label: `  ${entry.name}` });
          } else {
            unsupportedFiles.push({
              id: fullPath,
              label: `  ${entry.name}`,
              description: "(unsupported)",
            });
          }
        }
      }

      // Directories first, then supported files, then unsupported
      items.push(...dirs, ...supportedFiles, ...unsupportedFiles);

      // Cap at 200 items
      const MAX_ITEMS = 200;
      if (items.length > MAX_ITEMS) {
        const remaining = items.length - MAX_ITEMS;
        const capped = items.slice(0, MAX_ITEMS);
        capped.push({
          id: "__more__",
          label: `(${remaining} more items not shown)`,
        });
        return capped;
      }

      return items;
    },
    []
  );

  const handleApprovalRequest = useCallback(
    async (event: AgentActionSpecificEvent): Promise<boolean> => {
      if (event.type !== "tool_approve_execution") {
        return false;
      }
      // Auto-approve all fs-cli tools when auto-accept is on
      if (
        autoAcceptEditsRef.current &&
        event.metadata.mcpServerName === "fs-cli"
      ) {
        return true;
      }
      // Auto-approve if stake is never_ask
      if (event.stake === "never_ask") {
        return true;
      }

      // For low stake tools, check cache first
      if (event.stake === "low") {
        const cachedApproval = await toolsCache.getCachedApproval({
          agentName: event.metadata.agentName,
          mcpServerName: event.metadata.mcpServerName,
          toolName: event.metadata.toolName,
        });

        if (cachedApproval !== null) {
          return cachedApproval;
        }
      }

      // For low/high stake, prompt user for approval via inline selector
      return new Promise<boolean>((resolve) => {
        const isLowStake = event.stake === "low";
        const items = isLowStake
          ? LOW_STAKE_TOOL_APPROVAL_ITEMS
          : TOOL_APPROVAL_ITEMS;

        setPendingApproval(event);
        setApprovalResolver(() => resolve);

        // Close any existing inline selector (e.g. file browsing) - approval takes priority
        setInlineSelector({
          mode: "tool_approval",
          items,
          query: "",
          selectedIndex: 0,
        });
      });
    },
    []
  );

  const handleApproval = useCallback(
    async (approved: boolean, cacheApproval?: boolean) => {
      if (approvalResolver && pendingApproval) {
        if (pendingApproval.type !== "tool_approve_execution") {
          console.error(
            "Unexpected event type for approval handling:",
            pendingApproval.type
          );
          approvalResolver(false);
          setPendingApproval(null);
          setApprovalResolver(null);
          setInlineSelector(null);
          return;
        }
        // Cache the approval if requested and it's a low stake tool
        if (cacheApproval && pendingApproval.stake === "low") {
          await toolsCache.setCachedApproval({
            agentName: pendingApproval.metadata.agentName,
            mcpServerName: pendingApproval.metadata.mcpServerName,
            toolName: pendingApproval.metadata.toolName,
          });
        }

        approvalResolver(approved);
        setPendingApproval(null);
        setApprovalResolver(null);
        setInlineSelector(null);
      }
    },
    [approvalResolver, pendingApproval]
  );

  const handleDiffApproval = useCallback(
    async (approved: boolean) => {
      if (diffApprovalResolver && pendingDiffApproval) {
        diffApprovalResolver(approved);
        setPendingDiffApproval(null);
        setDiffApprovalResolver(null);
      }
    },
    [diffApprovalResolver, pendingDiffApproval]
  );

  const requestDiffApproval = useCallback(
    async (
      originalContent: string,
      updatedContent: string,
      filePath: string
    ): Promise<boolean> => {
      // If always accept flag is set, immediately return true
      if (autoAcceptEditsRef.current) {
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        setPendingDiffApproval({ originalContent, updatedContent, filePath });
        setDiffApprovalResolver(() => (approved: boolean) => {
          resolve(approved);
        });
      });
    },
    []
  );

  const clearFiles = useCallback(() => {
    setUploadedFiles([]);
    setPendingFiles([]);
    setIsUploadingFiles(false);
  }, []);

  const showAttachDialog = useCallback(async () => {
    const cwd = process.cwd();
    const items = await loadDirectoryItems(cwd);

    setUserInput("");
    setCursorPosition(0);
    setShowCommandSelector(false);
    setCommandQuery("");
    setSelectedCommandIndex(0);
    setCommandCursorPosition(0);

    setInlineSelector({
      mode: "file",
      items,
      query: "",
      selectedIndex: 0,
      currentPath: cwd,
    });
  }, [loadDirectoryItems]);

  const toggleAutoEdits = useCallback(() => {
    setAutoAcceptEdits((prev) => !prev);
  }, [setAutoAcceptEdits]);

  // Helper to create a conversation for file uploads if none exists
  // Only useful for uploading files to the first message
  const createConversationForFiles = useCallback(
    async (title: string) => {
      if (!selectedAgent || !me || meError || isMeLoading) {
        return null;
      }

      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        setError(dustClientRes.error.message);
        return null;
      }

      const dustClient = dustClientRes.value;
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        return null;
      }

      const convRes = await dustClient.createConversation({
        title,
        visibility: "unlisted",
        contentFragments: [],
      });

      if (convRes.isErr()) {
        setError(`Failed to create conversation: ${convRes.error.message}`);
        return null;
      }

      setCurrentConversationId(convRes.value.conversation.sId);
      return convRes.value.conversation.sId;
    },
    [selectedAgent, me, meError, isMeLoading]
  );

  const handleFileSelected = useCallback(
    async (filePathOrPaths: string | string[]) => {
      // Normalize to array for unified handling
      const paths = Array.isArray(filePathOrPaths)
        ? filePathOrPaths
        : [filePathOrPaths];

      const fileInfos = [];
      for (const p of paths) {
        const fileInfoRes = await validateAndGetFileInfo(p);
        if (fileInfoRes.isErr()) {
          setError(`File error: ${normalizeError(fileInfoRes.error).message}`);
          return;
        }

        fileInfos.push(fileInfoRes.value);
      }

      let convId = currentConversationId;
      if (!convId) {
        convId = await createConversationForFiles(
          `File Upload: ${fileInfos.map((f) => f.name).join(", ")}`.slice(0, 50)
        );
        if (!convId) {
          // error already handled in createConversationForFiles
          return;
        }
      }

      setPendingFiles(fileInfos);
      setIsUploadingFiles(true);
    },
    [currentConversationId, createConversationForFiles]
  );

  const clearConversation = useCallback(async () => {
    await clearTerminal();
    setConversationItems(
      selectedAgent
        ? [
            {
              key: "welcome_header",
              type: "welcome_header",
              agentName: selectedAgent.name,
              agentDescription: selectedAgent.description,
            },
          ]
        : []
    );
  }, [selectedAgent]);

  const startNewConversation = useCallback(async () => {
    await clearTerminal();
    setCurrentConversationId(null);
    setConversationItems(
      selectedAgent
        ? [
            {
              key: "welcome_header",
              type: "welcome_header",
              agentName: selectedAgent.name,
              agentDescription: selectedAgent.description,
            },
          ]
        : []
    );
    setUploadedFiles([]);
    setPendingFiles([]);
  }, [selectedAgent]);

  const showHelp = useCallback(() => {
    setConversationItems((prev) => [
      ...prev,
      {
        key: `help_${Date.now()}`,
        type: "info_message",
        text: [
          "Commands: /help /switch /new /resume /history /attach /clear-files /clear /info /export /auto /exit",
          "Shortcuts: Enter=send  \\Enter=newline  ESC=clear/cancel  Shift+Tab=toggle auto  Ctrl+G=open in browser",
        ].join("\n"),
      },
      { key: `help_sep_${Date.now()}`, type: "separator" },
    ]);
  }, []);

  const showInfo = useCallback(() => {
    const info = [
      `Agent: @${selectedAgent?.name ?? "none"}`,
      selectedAgent?.description
        ? `Description: ${selectedAgent.description.split("\n")[0]}`
        : null,
      `Conversation: ${currentConversationId ?? "not started"}`,
      `Filesystem: ${fileSystemServerId ? "enabled" : "disabled"}`,
      `Auto-accept edits: ${autoAcceptEdits ? "on" : "off"}`,
    ]
      .filter(Boolean)
      .join("\n");

    setConversationItems((prev) => [
      ...prev,
      {
        key: `info_${Date.now()}`,
        type: "info_message",
        text: info,
      },
      { key: `info_sep_${Date.now()}`, type: "separator" },
    ]);
  }, [selectedAgent, currentConversationId, fileSystemServerId, autoAcceptEdits]);

  const showHistory = useCallback(async () => {
    const dustClientRes = await getDustClient();
    if (dustClientRes.isErr()) {
      setError(dustClientRes.error.message);
      return;
    }
    const dustClient = dustClientRes.value;
    if (!dustClient) {
      setError("Authentication required. Run `dust login` first.");
      return;
    }

    const convRes = await dustClient.getConversations();
    if (convRes.isErr()) {
      setError(`Failed to fetch conversations: ${convRes.error.message}`);
      return;
    }

    const conversations = convRes.value
      .filter((c) => c.visibility !== "deleted")
      .slice(0, 15);

    if (conversations.length === 0) {
      setConversationItems((prev) => [
        ...prev,
        {
          key: `history_${Date.now()}`,
          type: "info_message",
          text: "No recent conversations found.",
        },
        { key: `history_sep_${Date.now()}`, type: "separator" },
      ]);
      return;
    }

    const lines = conversations
      .map((c) => {
        const date = new Date(c.created).toLocaleDateString();
        const title = c.title || "Untitled";
        return `  ${date}  ${title}  (${c.sId})`;
      })
      .join("\n");

    setConversationItems((prev) => [
      ...prev,
      {
        key: `history_header_${Date.now()}`,
        type: "info_message",
        text: `Recent conversations:\n${lines}\n\nUse --resume <id> or dust -c <id> to resume.`,
      },
      { key: `history_sep_${Date.now()}`, type: "separator" },
    ]);
  }, []);

  const resumeConversation = useCallback(async () => {
    const dustClientRes = await getDustClient();
    if (dustClientRes.isErr()) {
      setError(dustClientRes.error.message);
      return;
    }
    const dustClient = dustClientRes.value;
    if (!dustClient) {
      setError("Authentication required. Run `dust login` first.");
      return;
    }

    const convRes = await dustClient.getConversations();
    if (convRes.isErr()) {
      setError(`Failed to fetch conversations: ${convRes.error.message}`);
      return;
    }

    const conversations = convRes.value
      .filter((c) => c.visibility !== "deleted")
      .slice(0, 20);

    if (conversations.length === 0) {
      setConversationItems((prev) => [
        ...prev,
        {
          key: `resume_empty_${Date.now()}`,
          type: "info_message",
          text: "No recent conversations found.",
        },
        { key: `resume_sep_${Date.now()}`, type: "separator" },
      ]);
      return;
    }

    const items: InlineSelectorItem[] = conversations.map((c) => ({
      id: c.sId,
      label: `${new Date(c.created).toLocaleDateString()} - ${c.title || "Untitled"}`,
    }));

    setUserInput("");
    setCursorPosition(0);
    setShowCommandSelector(false);
    setCommandQuery("");
    setSelectedCommandIndex(0);
    setCommandCursorPosition(0);

    setInlineSelector({
      mode: "conversation",
      items,
      query: "",
      selectedIndex: 0,
    });
  }, []);

  const handleConversationSelected = useCallback(
    async (convSId: string) => {
      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        setError(dustClientRes.error.message);
        return;
      }
      const dustClient = dustClientRes.value;
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        return;
      }

      const convRes = await dustClient.getConversation({
        conversationId: convSId,
      });
      if (convRes.isErr()) {
        setError(`Failed to load conversation: ${convRes.error.message}`);
        return;
      }

      const conv = convRes.value;
      setCurrentConversationId(convSId);

      const items: ConversationItem[] = [
        {
          key: "welcome_header",
          type: "welcome_header",
          agentName: selectedAgent?.name ?? "dust",
          agentDescription: selectedAgent?.description ?? "",
        },
      ];

      let userMsgIdx = 0;
      let agentMsgIdx = 0;

      for (const messageGroup of conv.content) {
        for (const msg of messageGroup) {
          if (msg.type === "user_message") {
            items.push({
              key: `resumed_user_${userMsgIdx}`,
              type: "user_message",
              firstName: msg.user?.firstName ?? "You",
              content: msg.content,
              index: userMsgIdx,
            });
            userMsgIdx++;
          } else if (msg.type === "agent_message") {
            // Build timeline from chain of thought + actions
            const timeline: TimelineEntry[] = [];
            if (msg.chainOfThought) {
              timeline.push({ type: "thought", text: msg.chainOfThought });
            }
            for (const action of msg.actions) {
              const label =
                action.displayLabels?.done ||
                action.functionCallName ||
                action.toolName;
              timeline.push({
                type: "action_done",
                label,
                durationMs: action.executionDurationMs ?? null,
              });
            }
            items.push({
              key: `resumed_agent_${agentMsgIdx}`,
              type: "agent_message",
              agentName: msg.configuration.name,
              timeline,
              content: msg.content?.trim() ?? "",
              index: agentMsgIdx,
            });
            agentMsgIdx++;
          }
        }
      }

      await clearTerminal();
      setConversationItems(items);
    },
    [selectedAgent]
  );

  const exportConversation = useCallback(async () => {
    // Gather all text content from conversation items
    const textParts: string[] = [];
    for (const item of conversationItems) {
      if (item.type === "user_message") {
        textParts.push(`${item.firstName}: ${item.content}`);
      } else if (item.type === "agent_message") {
        textParts.push(`\n${item.agentName}:`);
        for (const entry of item.timeline) {
          if (entry.type === "thought") {
            textParts.push(
              entry.text
                .split("\n")
                .map((l) => `  [thinking] ${l}`)
                .join("\n")
            );
          } else {
            const duration = entry.durationMs
              ? ` (${(entry.durationMs / 1000).toFixed(1)}s)`
              : "";
            textParts.push(`  [action] ${entry.label}${duration}`);
          }
        }
        textParts.push(item.content);
      }
    }

    const text = textParts.join("\n");
    try {
      const clipboardy = await import("clipboardy");
      await clipboardy.default.write(text);
      setConversationItems((prev) => [
        ...prev,
        {
          key: `export_${Date.now()}`,
          type: "info_message",
          text: "Conversation copied to clipboard.",
        },
        { key: `export_sep_${Date.now()}`, type: "separator" },
      ]);
    } catch {
      setError("Failed to copy to clipboard.");
    }
  }, [conversationItems]);

  const commands = createCommands({
    triggerAgentSwitch,
    clearFiles,
    attachFile: showAttachDialog,
    toggleAutoEdits,
    clearConversation,
    startNewConversation,
    showHelp,
    showInfo,
    showHistory,
    resumeConversation,
    exportConversation,
  });

  // Cache Edit tool when agent is selected, since approval is asked anyways
  // TODO: add check for the fact that we are using fs server when implemented
  useEffect(() => {
    const cacheEditTool = async () => {
      if (selectedAgent) {
        // Pre-cache the Edit tool to avoid approval prompts
        await toolsCache.setCachedApproval({
          agentName: selectedAgent.name,
          mcpServerName: "fs-cli",
          toolName: "edit_file",
        });
      }
    };
    void cacheEditTool();
  }, [selectedAgent]);

  // Handle agent search when component mounts
  useEffect(() => {
    if (!agentSearch || !allAgents || allAgents.length === 0 || selectedAgent) {
      return;
    }

    // Search for agents matching the search string (case-insensitive)
    const searchLower = agentSearch.toLowerCase();
    const matchingAgents = allAgents.filter((agent) =>
      agent.name.toLowerCase().startsWith(searchLower)
    );

    if (matchingAgents.length === 0) {
      setError(`No agent found starting with "${agentSearch}"`);
      return;
    }

    // Select the first matching agent (same as SelectWithSearch behavior)
    const agentToSelect = matchingAgents[0];

    // Set the selected agent and initial conversation items
    setSelectedAgent(agentToSelect);
    setConversationItems([
      {
        key: "welcome_header",
        type: "welcome_header",
        agentName: agentToSelect.name,
        agentDescription: agentToSelect.description,
      },
    ]);
  }, [agentSearch, allAgents, selectedAgent]);

  // Auto-select @dust agent when no agent/sId/search is specified
  useEffect(() => {
    if (selectedAgent || requestedSId || agentSearch) {
      return;
    }
    if (!allAgents || allAgents.length === 0) {
      return;
    }

    const dustAgent = allAgents.find((agent) => agent.sId === "dust");
    if (dustAgent) {
      setSelectedAgent(dustAgent);
      setConversationItems([
        {
          key: "welcome_header",
          type: "welcome_header",
          agentName: dustAgent.name,
          agentDescription: dustAgent.description,
        },
      ]);
    }
  }, [allAgents, selectedAgent, requestedSId, agentSearch]);

  // Load conversation history when resuming
  useEffect(() => {
    if (!conversationId || !selectedAgent || conversationItems.length > 1) {
      return;
    }

    void (async () => {
      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        setError(dustClientRes.error.message);
        return;
      }
      const dustClient = dustClientRes.value;
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        return;
      }

      const convRes = await dustClient.getConversation({
        conversationId,
      });
      if (convRes.isErr()) {
        setError(
          `Failed to load conversation: ${convRes.error.message}`
        );
        return;
      }

      const conv = convRes.value;
      const items: ConversationItem[] = [
        {
          key: "welcome_header",
          type: "welcome_header",
          agentName: selectedAgent.name,
          agentDescription: selectedAgent.description,
        },
      ];

      let userMsgIdx = 0;
      let agentMsgIdx = 0;

      for (const messageGroup of conv.content) {
        for (const msg of messageGroup) {
          if (msg.type === "user_message") {
            items.push({
              key: `resumed_user_${userMsgIdx}`,
              type: "user_message",
              firstName: msg.user?.firstName ?? "You",
              content: msg.content,
              index: userMsgIdx,
            });
            userMsgIdx++;
          } else if (msg.type === "agent_message") {
            // Build timeline from chain of thought + actions
            const timeline: TimelineEntry[] = [];
            if (msg.chainOfThought) {
              timeline.push({ type: "thought", text: msg.chainOfThought });
            }
            for (const action of msg.actions) {
              const label =
                action.displayLabels?.done ||
                action.functionCallName ||
                action.toolName;
              timeline.push({
                type: "action_done",
                label,
                durationMs: action.executionDurationMs ?? null,
              });
            }
            items.push({
              key: `resumed_agent_${agentMsgIdx}`,
              type: "agent_message",
              agentName: msg.configuration.name,
              timeline,
              content: msg.content?.trim() ?? "",
              index: agentMsgIdx,
            });
            agentMsgIdx++;
          }
        }
      }

      setConversationItems(items);
    })();
  }, [conversationId, selectedAgent]);

  // Auto-initialize filesystem server (enabled by default)
  useEffect(() => {
    if (fileSystemInitialized || !selectedAgent) {
      return;
    }
    setFileSystemInitialized(true);

    void (async () => {
      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        setError(dustClientRes.error.message);
        return;
      }
      const dustClient = dustClientRes.value;
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        return;
      }
      const useFsServerRes = await useFileSystemServer(
        dustClient,
        (serverId) => {
          setFileSystemServerId(serverId);
        },
        requestDiffApproval
      );
      if (useFsServerRes.isErr()) {
        setError(useFsServerRes.error.message);
      }
    })();
  }, [fileSystemInitialized, selectedAgent, requestDiffApproval]);

  // Flush pending static item after the streaming area has cleared.
  // This two-phase approach avoids Ink cursor positioning issues: first the
  // dynamic streaming area shrinks, then on the next render the static item
  // is inserted — so Ink never has to erase a large dynamic area and insert
  // a large static item in the same frame.
  useEffect(() => {
    if (streamingContent === null && pendingStaticItemRef.current) {
      const item = pendingStaticItemRef.current;
      pendingStaticItemRef.current = null;
      setConversationItems((prev) => [...prev, item]);
    }
  }, [streamingContent]);

  useEffect(() => {
    autoAcceptEditsRef.current = autoAcceptEdits;
  }, [autoAcceptEdits]);

  const canSubmit =
    me &&
    !meError &&
    !isMeLoading &&
    !isProcessingQuestion &&
    !inlineSelector &&
    !!userInput.trim();

  const handleSubmitQuestion = useCallback(
    async (questionText: string, attachedFiles: UploadedFile[] = []) => {
      if (!selectedAgent || !me || meError || isMeLoading) {
        return;
      }

      // Set up the streaming area for the mutable content.
      // IMPORTANT: Initialize streamingContent to "" (non-null) so that when
      // finalizeStreamingToStatic() sets it back to null, the useEffect
      // watching streamingContent will fire and flush the pending static item.
      // Without this, fast responses that complete before the 150ms interval
      // can leave streamingContent as null→null (a no-op), causing the
      // useEffect to never fire and the agent message to disappear.
      setStreamingContent("");
      setStreamingAgentName(selectedAgent.name);
      setStreamingAgentState("thinking");
      setStreamingActionLabel(null);
      setStreamingTimeline([]);
      agentStateRef.current = "thinking";
      currentActionRef.current = null;
      timelineRef.current = [];

      setConversationItems((prev) => {
        const lastUserMessage = getLastConversationItem<
          ConversationItem & { type: "user_message" }
        >(prev, "user_message");

        const newUserMessageIndex = lastUserMessage
          ? lastUserMessage.index + 1
          : 0;
        const newUserMessageKey = `user_message_${newUserMessageIndex}`;

        const newItems = [...prev];
        const itemsToAdd: ConversationItem[] = [
          {
            key: newUserMessageKey,
            type: "user_message",
            firstName: me.firstName ?? "You",
            content: questionText,
            index: newUserMessageIndex,
          },
        ];

        // Add attachments if present
        if (attachedFiles.length > 0) {
          itemsToAdd.push({
            key: `user_message_attachments_${newUserMessageIndex}`,
            type: "user_message_attachments",
            attachments: attachedFiles,
            index: newUserMessageIndex,
          });
        }

        // Don't push agent_message yet — it's shown in the mutable streaming area
        // and will be pushed to Static as a single item when streaming completes.

        return [...newItems, ...itemsToAdd];
      });

      setIsProcessingQuestion(true);
      const controller = new AbortController();
      setAbortController(controller);

      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        setError(dustClientRes.error.message);
        return;
      }

      const dustClient = dustClientRes.value;
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsProcessingQuestion(false);
        setConversationItems((prev) => prev.slice(0, -1));
        return;
      }

      let userMessageId: string;
      let conversation: CreateConversationResponseType["conversation"];

      const currentAgentMessageIndex = agentMessageCountRef.current++;


      try {
        let createdContentFragments = [];
        // If there are files to attach, create content fragments for each
        if (attachedFiles.length > 0 && currentConversationId) {
          for (const file of attachedFiles) {
            const fragmentRes = await dustClient.postContentFragment({
              conversationId: currentConversationId,
              contentFragment: {
                title: file.fileName,
                fileId: file.fileId,
              },
            });
            if (fragmentRes.isErr()) {
              setError(
                `Failed to create content fragment: ${fragmentRes.error.message}`
              );
              setIsProcessingQuestion(false);
              return;
            }
            createdContentFragments.push({
              type: "file_attachment",
              fileId: file.fileId,
              title: file.fileName,
            });
          }
        }

        if (!currentConversationId) {
          // For new conversation, pass contentFragments (from uploaded files)
          const contentFragments = attachedFiles.map((file) => ({
            type: "file_attachment" as const,
            fileId: file.fileId,
            title: file.fileName,
          }));

          const convRes = await dustClient.createConversation({
            title: `CLI Question: ${questionText.substring(0, 30)}${
              questionText.length > 30 ? "..." : ""
            }`,
            visibility: "unlisted",
            message: {
              content: questionText,
              mentions: [{ configurationId: selectedAgent.sId }],
              context: {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                username: me.username,
                fullName: me.fullName,
                email: me.email,
                origin: "cli",
                clientSideMCPServerIds: fileSystemServerId
                  ? [fileSystemServerId]
                  : null,
              },
            },
            contentFragments,
          });

          if (convRes.isErr()) {
            throw new Error(
              `Failed to create conversation: ${convRes.error.message}`
            );
          }

          conversation = convRes.value.conversation;
          setCurrentConversationId(conversation.sId);

          if (!convRes.value.message) {
            throw new Error("No message created");
          }
          userMessageId = convRes.value.message.sId;
        } else {
          const workspaceId = await AuthService.getSelectedWorkspaceId();
          if (!workspaceId) {
            throw new Error("No workspace selected");
          }

          const messageRes = await dustClient.postUserMessage({
            conversationId: currentConversationId,
            message: {
              content: questionText,
              mentions: [{ configurationId: selectedAgent.sId }],
              context: {
                clientSideMCPServerIds: fileSystemServerId
                  ? [fileSystemServerId]
                  : null,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                username: me.username,
                fullName: me.fullName,
                email: me.email,
                origin: "cli",
              },
            },
          });

          if (messageRes.isErr()) {
            throw new Error(
              `Error creating message: ${messageRes.error.message}`
            );
          }

          userMessageId = messageRes.value.sId;

          // Get the conversation for streaming
          const convRes = await dustClient.getConversation({
            conversationId: currentConversationId,
          });
          if (convRes.isErr()) {
            throw new Error(
              `Error retrieving conversation: ${convRes.error.message}`
            );
          }
          conversation = convRes.value;
        }

        // Stream the agent's response
        const streamRes = await dustClient.streamAgentAnswerEvents({
          conversation: conversation,
          userMessageId: userMessageId,
          signal: controller.signal, // Add the abort signal
        });

        if (streamRes.isErr()) {
          throw new Error(
            `Failed to stream agent answer: ${streamRes.error.message}`
          );
        }

        const finalizeStreamingToStatic = () => {
          // Stash the completed message and clear the streaming area.
          // The useEffect watching streamingContent will flush the pending
          // item to Static on the next render, avoiding Ink cursor glitches.
          pendingStaticItemRef.current = {
            key: `agent_message_${currentAgentMessageIndex}`,
            type: "agent_message",
            agentName: selectedAgent.name,
            timeline: [...timelineRef.current],
            content: contentRef.current.trim(),
            index: currentAgentMessageIndex,
          };

          setStreamingContent(null);
          setStreamingAgentName(null);
          setStreamingAgentState(null);
          setStreamingActionLabel(null);
          setStreamingTimeline([]);
        };

        // During streaming, sync refs to React state every 150ms
        updateIntervalRef.current = setInterval(() => {
          setStreamingContent((prev) =>
            prev === contentRef.current ? prev : contentRef.current
          );
          setStreamingAgentState(agentStateRef.current);
          const actionRef = currentActionRef.current;
          setStreamingActionLabel(
            actionRef
              ? actionRef.notificationLabel || actionRef.runningLabel
              : null
          );
          setStreamingTimeline((prev) => {
            const tl = timelineRef.current;
            // Quick identity check: compare length and last entry text for thoughts
            if (prev.length === tl.length) {
              const last = tl[tl.length - 1];
              const prevLast = prev[prev.length - 1];
              if (
                !last ||
                !prevLast ||
                (last.type === prevLast.type &&
                  last.type === "thought" &&
                  prevLast.type === "thought" &&
                  last.text === prevLast.text)
              ) {
                return prev;
              }
            }
            return [...tl];
          });
        }, 150);

        for await (const event of streamRes.value.eventStream) {
          if (event.type === "generation_tokens") {
            if (event.classification === "tokens") {
              if (agentStateRef.current !== "writing") {
                agentStateRef.current = "writing";
              }
              contentRef.current += event.text;
            } else if (event.classification === "chain_of_thought") {
              chainOfThoughtRef.current += event.text;
              // Append to timeline: merge into last thought entry or create new one
              const tl = timelineRef.current;
              const last = tl[tl.length - 1];
              if (last && last.type === "thought") {
                last.text += event.text;
              } else {
                tl.push({ type: "thought", text: event.text });
              }
            }
          } else if (event.type === "tool_params") {
            agentStateRef.current = "acting";
            const action = event.action;
            const runningLabel =
              action.displayLabels?.running ||
              action.functionCallName ||
              action.toolName;
            currentActionRef.current = {
              runningLabel,
              notificationLabel: null,
            };
          } else if (event.type === "tool_notification") {
            const notifLabel: string = event.notification.data.label;
            if (currentActionRef.current !== null) {
              const rl: string = currentActionRef.current.runningLabel;
              currentActionRef.current = {
                runningLabel: rl,
                notificationLabel: notifLabel,
              };
            }
          } else if (event.type === "agent_action_success") {
            const successEvent = event as AgentActionSuccessEvent;
            const action = successEvent.action;
            const label =
              action.displayLabels?.done ||
              action.functionCallName ||
              action.toolName;
            timelineRef.current = [
              ...timelineRef.current,
              {
                type: "action_done",
                label,
                durationMs: action.executionDurationMs ?? null,
              },
            ];
            currentActionRef.current = null;
            agentStateRef.current = "thinking";
          } else if (event.type === "agent_error") {
            throw new Error(`Agent error: ${event.error.message}`);
          } else if (event.type === "user_message_error") {
            throw new Error(`User message error: ${event.error.message}`);
          } else if (event.type === "agent_generation_cancelled") {
            if (updateIntervalRef.current) {
              clearInterval(updateIntervalRef.current);
            }
            setError(null);
            contentRef.current = contentRef.current || "[Cancelled]";
            finalizeStreamingToStatic();
            chainOfThoughtRef.current = "";
            contentRef.current = "";
            timelineRef.current = [];
            agentStateRef.current = "thinking";
            currentActionRef.current = null;
            break;
          } else if (event.type === "agent_message_success") {
            if (updateIntervalRef.current) {
              clearInterval(updateIntervalRef.current);
            }
            setError(null);
            finalizeStreamingToStatic();
            chainOfThoughtRef.current = "";
            contentRef.current = "";
            timelineRef.current = [];
            agentStateRef.current = "thinking";
            currentActionRef.current = null;
            break;
          } else if (event.type === "tool_approve_execution") {
            const approved = await handleApprovalRequest(event);
            await dustClient.validateAction({
              conversationId: event.conversationId,
              messageId: event.messageId,
              actionId: event.actionId,
              approved: approved ? "approved" : "rejected",
            });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          setAbortController(null);
          if (updateIntervalRef.current) {
            clearInterval(updateIntervalRef.current);
          }

          // Clear the mutable streaming area and queue cancelled marker
          pendingStaticItemRef.current = {
            key: `agent_message_cancelled_${currentAgentMessageIndex}`,
            type: "agent_message_cancelled",
          };
          setStreamingContent(null);
          setStreamingAgentName(null);
          setStreamingAgentState(null);
          setStreamingActionLabel(null);
          setStreamingTimeline([]);

          chainOfThoughtRef.current = "";
          contentRef.current = "";
          timelineRef.current = [];
          agentStateRef.current = "thinking";
          currentActionRef.current = null;

          setIsProcessingQuestion(false);

          return;
        }

        setError(`Error: ${normalizeError(error).message}`);
      } finally {
        setIsProcessingQuestion(false);
        setAbortController(null);
      }
    },
    [
      selectedAgent,
      currentConversationId,
      me,
      meError,
      isMeLoading,
      uploadedFiles,
      fileSystemServerId,
    ]
  );

  // Handle file upload completion
  const handleFileUploadComplete = useCallback(
    (files: UploadedFile[]) => {
      setUploadedFiles(files);
      setIsUploadingFiles(false);
      setPendingFiles([]);

      // If there's a message waiting to be sent with these files, send it now
      if (userInput.trim()) {
        void handleSubmitQuestion(userInput, files);
        setUserInput("");
        setCursorPosition(0);
      }
    },
    [userInput, handleSubmitQuestion]
  );

  // Handle file upload error
  const handleFileUploadError = useCallback((error: string) => {
    setError(error);
    setIsUploadingFiles(false);
    setPendingFiles([]);
  }, []);

  // Handle keyboard events.
  useInput((input, key) => {
    if (!selectedAgent) {
      return;
    }

    // Handle inline selector keyboard (agent switch, conversation resume, file, tool_approval).
    if (inlineSelector) {
      // ESC handling per mode
      if (key.escape) {
        if (inlineSelector.mode === "tool_approval") {
          // ESC rejects the tool
          void handleApproval(false);
        }
        setInlineSelector(null);
        return;
      }

      // Filter items for navigation bounds (no filtering for tool_approval).
      const filtered =
        inlineSelector.mode === "tool_approval"
          ? inlineSelector.items
          : inlineSelector.items.filter((item) =>
              item.label.toLowerCase().includes(inlineSelector.query.toLowerCase())
            );
      const maxVisible = 10;
      const visibleCount = Math.min(filtered.length, maxVisible);

      if (key.upArrow) {
        setInlineSelector((prev) =>
          prev
            ? { ...prev, selectedIndex: Math.max(0, prev.selectedIndex - 1) }
            : prev
        );
        return;
      }

      if (key.downArrow) {
        setInlineSelector((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex: Math.min(visibleCount - 1, prev.selectedIndex + 1),
              }
            : prev
        );
        return;
      }

      if (key.return) {
        if (filtered.length > 0 && inlineSelector.selectedIndex < filtered.length) {
          const selected = filtered[inlineSelector.selectedIndex];

          if (inlineSelector.mode === "agent") {
            const agent = (allAgents || []).find((a) => a.sId === selected.id);
            if (agent) {
              setSelectedAgent(agent);
              setConversationItems((prev) => [
                ...prev,
                {
                  key: `switch_${Date.now()}`,
                  type: "info_message",
                  text: `Switched to @${agent.name}`,
                },
                { key: `switch_sep_${Date.now()}`, type: "separator" },
              ]);
            }
            setInlineSelector(null);
          } else if (inlineSelector.mode === "conversation") {
            void handleConversationSelected(selected.id);
            setInlineSelector(null);
          } else if (inlineSelector.mode === "file") {
            if (selected.id === "__more__") {
              // No-op for the "more items" placeholder
              return;
            }
            // Check if it's a directory (label starts with folder icon or "..")
            void (async () => {
              try {
                const targetStat = await stat(selected.id);
                if (targetStat.isDirectory()) {
                  const items = await loadDirectoryItems(selected.id);
                  setInlineSelector({
                    mode: "file",
                    items,
                    query: "",
                    selectedIndex: 0,
                    currentPath: selected.id,
                  });
                } else {
                  // It's a file - check if supported
                  const ext = getFileExtension(selected.id);
                  if (isSupportedFileType(ext)) {
                    setInlineSelector(null);
                    await handleFileSelected(selected.id);
                  }
                  // Unsupported file - no-op
                }
              } catch {
                // If stat fails, close selector
                setInlineSelector(null);
              }
            })();
          } else if (inlineSelector.mode === "tool_approval") {
            const approved =
              selected.id === "approve" || selected.id === "approve_and_cache";
            const cacheApproval = selected.id === "approve_and_cache";
            void handleApproval(approved, cacheApproval);
          }
        }
        return;
      }

      // Disable type-to-filter and backspace for tool_approval mode
      if (inlineSelector.mode === "tool_approval") {
        return;
      }

      // For file mode, filter by typed query
      if (key.backspace || key.delete) {
        setInlineSelector((prev) =>
          prev
            ? {
                ...prev,
                query: prev.query.slice(0, -1),
                selectedIndex: 0,
              }
            : prev
        );
        return;
      }

      // Regular character input for search.
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setInlineSelector((prev) =>
          prev
            ? {
                ...prev,
                query: prev.query + input,
                selectedIndex: 0,
              }
            : prev
        );
        return;
      }

      // Absorb all other keys while inline selector is open.
      return;
    }

    const isInCommandMode = showCommandSelector;
    const currentInput = isInCommandMode ? commandQuery : userInput;
    const currentCursorPos = isInCommandMode
      ? commandCursorPosition
      : cursorPosition;
    const setCurrentInput = isInCommandMode ? setCommandQuery : setUserInput;
    const setCurrentCursorPos = isInCommandMode
      ? setCommandCursorPosition
      : setCursorPosition;

    // Handle command selector specific navigation.
    if (showCommandSelector) {
      if (key.escape) {
        setShowCommandSelector(false);
        setCommandQuery("");
        setSelectedCommandIndex(0);
        setCommandCursorPosition(0);
        return;
      }

      if (key.upArrow) {
        setSelectedCommandIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        const filteredCommands = commands.filter((cmd) =>
          cmd.name.toLowerCase().startsWith(commandQuery.toLowerCase())
        );
        setSelectedCommandIndex((prev) =>
          Math.min(filteredCommands.length - 1, prev + 1)
        );
        return;
      }

      if (key.return) {
        const filteredCommands = commands.filter((cmd) =>
          cmd.name.toLowerCase().startsWith(commandQuery.toLowerCase())
        );
        if (
          filteredCommands.length > 0 &&
          selectedCommandIndex < filteredCommands.length
        ) {
          const selectedCommand = filteredCommands[selectedCommandIndex];
          void selectedCommand.execute({ triggerAgentSwitch });
          setShowCommandSelector(false);
          setCommandQuery("");
          setSelectedCommandIndex(0);
          setCommandCursorPosition(0);
          setUserInput("");
          setCursorPosition(0);
        }
        return;
      }
    }

    if (key.ctrl && input === "g") {
      if (currentConversationId) {
        void (async () => {
          const workspaceId = await AuthService.getSelectedWorkspaceId();
          if (workspaceId) {
            const url = `https://dust.tt/w/${workspaceId}/agent/${currentConversationId}`;
            await open(url);
          } else {
            console.error("\nCould not determine workspace ID");
          }
        })();
      }
      return;
    }

    // Shift+Tab to cycle auto-approval mode
    if (key.tab && key.shift) {
      setAutoAcceptEdits((prev) => !prev);
      return;
    }

    if (key.escape) {
      if (isProcessingQuestion && abortController) {
        abortController.abort();
      } else if (userInput) {
        setUserInput("");
        setCursorPosition(0);
      }
      return;
    }

    // Check for backslash + Enter to add new line, or regular Enter to submit
    if (key.return && !isInCommandMode) {
      // Check if the previous character is a backslash for multi-line input
      if (cursorPosition > 0 && userInput[cursorPosition - 1] === "\\") {
        // Remove the backslash and add a newline
        const newInput =
          userInput.slice(0, cursorPosition - 1) +
          "\n" +
          userInput.slice(cursorPosition);
        setUserInput(newInput);
        // Position cursor right after the newline character
        setCursorPosition(cursorPosition); // Same position (we replaced \ with \n, both length 1)
        return;
      }

      // Only allow submission if not processing, "me" is loaded and user input is not empty
      if (!canSubmit) {
        return;
      }

      // No files, send message immediately
      void handleSubmitQuestion(userInput, uploadedFiles);
      setUserInput("");
      setCursorPosition(0);
      setUploadedFiles([]); // Clear uploaded files after sending

      return;
    }

    if (key.backspace || key.delete) {
      if (currentCursorPos > 0) {
        setCurrentInput(
          currentInput.slice(0, currentCursorPos - 1) +
            currentInput.slice(currentCursorPos)
        );
        setCurrentCursorPos(Math.max(0, currentCursorPos - 1));
        if (isInCommandMode) {
          setSelectedCommandIndex(0);
        }
      } else if (isInCommandMode && commandQuery.length === 0) {
        // If query is empty and backspace is pressed, close command selector.
        setShowCommandSelector(false);
        setCommandQuery("");
        setSelectedCommandIndex(0);
        setCommandCursorPosition(0);
      }
      return;
    }

    // Handle option+left (meta+b) to move to the previous word
    if (key.meta && input === "b" && currentCursorPos > 0) {
      let newPosition = currentCursorPos - 1;

      while (newPosition > 0 && /\s/.test(currentInput[newPosition])) {
        newPosition--;
      }

      while (newPosition > 0 && !/\s/.test(currentInput[newPosition - 1])) {
        newPosition--;
      }

      setCurrentCursorPos(newPosition);
      return;
    }

    // Handle option+right (meta+f) to move to the next word
    if (key.meta && input === "f" && currentCursorPos < currentInput.length) {
      let newPosition = currentCursorPos;

      // If we're on whitespace, skip to next non-whitespace.
      if (/\s/.test(currentInput[newPosition])) {
        while (
          newPosition < currentInput.length &&
          /\s/.test(currentInput[newPosition]) &&
          currentInput[newPosition] !== "\n"
        ) {
          newPosition++;
        }

        // If we hit a newline, stop there.
        if (currentInput[newPosition] === "\n") {
          setCurrentCursorPos(newPosition);
          return;
        }
      } else {
        // Skip the current word.
        while (
          newPosition < currentInput.length &&
          !/\s/.test(currentInput[newPosition])
        ) {
          newPosition++;
        }

        // Skip spaces after the word, but stop at newline.
        while (
          newPosition < currentInput.length &&
          /\s/.test(currentInput[newPosition]) &&
          currentInput[newPosition] !== "\n"
        ) {
          newPosition++;
        }
      }

      setCurrentCursorPos(newPosition);
      return;
    }

    // Handle cmd+left (ctrl+a) to go to beginning of line
    if (key.ctrl && input === "a") {
      if (isInCommandMode) {
        setCurrentCursorPos(0);
      } else {
        let newPosition = currentCursorPos;
        while (newPosition > 0 && currentInput[newPosition - 1] !== "\n") {
          newPosition--;
        }
        setCurrentCursorPos(newPosition);
      }
      return;
    }

    // Handle cmd+right (ctrl+e) to go to end of line
    if (key.ctrl && input === "e") {
      if (isInCommandMode) {
        setCurrentCursorPos(currentInput.length);
      } else {
        let newPosition = currentCursorPos;
        while (
          newPosition < currentInput.length &&
          currentInput[newPosition] !== "\n"
        ) {
          newPosition++;
        }
        setCurrentCursorPos(newPosition);
      }
      return;
    }

    // Regular arrow key handling (left/right for character movement)
    if (key.leftArrow && currentCursorPos > 0) {
      setCurrentCursorPos(currentCursorPos - 1);
      return;
    }

    if (key.rightArrow && currentCursorPos < currentInput.length) {
      setCurrentCursorPos(currentCursorPos + 1);
      return;
    }

    if (key.upArrow && !isInCommandMode) {
      const lines = currentInput.split("\n");
      let currentPos = 0;
      let lineIndex = 0;
      let posInLine = 0;

      // Find current line and position within that line.
      for (let i = 0; i < lines.length; i++) {
        if (
          currentCursorPos >= currentPos &&
          currentCursorPos <= currentPos + lines[i].length
        ) {
          lineIndex = i;
          posInLine = currentCursorPos - currentPos;
          break;
        }
        currentPos += lines[i].length + 1; // +1 for newline
      }

      // Move to previous line.
      if (lineIndex > 0) {
        const prevLineLength = lines[lineIndex - 1].length;
        const newPosInLine = Math.min(posInLine, prevLineLength);

        // Calculate new cursor position.
        let newCursorPos = 0;
        for (let i = 0; i < lineIndex - 1; i++) {
          newCursorPos += lines[i].length + 1;
        }
        newCursorPos += newPosInLine;

        setCurrentCursorPos(newCursorPos);
      } else {
        // Already on first line, go to beginning.
        setCurrentCursorPos(0);
      }
      return;
    }

    if (key.downArrow && !isInCommandMode) {
      const lines = currentInput.split("\n");
      let currentPos = 0;
      let lineIndex = 0;
      let posInLine = 0;

      // Find current line and position within that line.
      for (let i = 0; i < lines.length; i++) {
        if (
          currentCursorPos >= currentPos &&
          currentCursorPos <= currentPos + lines[i].length
        ) {
          lineIndex = i;
          posInLine = currentCursorPos - currentPos;
          break;
        }
        currentPos += lines[i].length + 1; // +1 for newline
      }

      // Move to next line.
      if (lineIndex < lines.length - 1) {
        const nextLineLength = lines[lineIndex + 1].length;
        const newPosInLine = Math.min(posInLine, nextLineLength);

        // Calculate new cursor position.
        let newCursorPos = 0;
        for (let i = 0; i <= lineIndex; i++) {
          newCursorPos += lines[i].length + 1;
        }
        newCursorPos += newPosInLine;

        setCurrentCursorPos(newCursorPos);
      } else {
        // Already on last line, go to end.
        setCurrentCursorPos(currentInput.length);
      }
      return;
    }

    // Handle regular character input
    if (!key.ctrl && !key.meta && input && input.length === 1) {
      // Check if typing "/" at the beginning of an empty input
      if (
        input === "/" &&
        userInput === "" &&
        cursorPosition === 0 &&
        !isInCommandMode
      ) {
        setShowCommandSelector(true);
        setCommandQuery("");
        setSelectedCommandIndex(0);
        setCommandCursorPosition(0);
        return;
      }

      const newInput =
        currentInput.slice(0, currentCursorPos) +
        input +
        currentInput.slice(currentCursorPos);
      setCurrentInput(newInput);
      setCurrentCursorPos(currentCursorPos + 1);
      if (isInCommandMode) {
        setSelectedCommandIndex(0);
      }
    } else if (input.length > 1) {
      // This is a special case that can happen with some terminals when pasting
      // without explicit keyboard shortcuts - they send the entire pasted content
      // as a single input event

      // Some terminals translate newlines to \r, so we normalize that to \n
      const normalizedInput = input.replace(/\r/g, "\n");

      const newInput =
        currentInput.slice(0, currentCursorPos) +
        normalizedInput +
        currentInput.slice(currentCursorPos);
      setCurrentInput(newInput);
      setCurrentCursorPos(currentCursorPos + normalizedInput.length);
      if (isInCommandMode) {
        setSelectedCommandIndex(0);
      }
    }
  });

  // Inline error: push error as a conversation item and clear error state
  useEffect(() => {
    if (error && selectedAgent) {
      setConversationItems((prev) => [
        ...prev,
        {
          key: `error_${Date.now()}`,
          type: "error_message",
          text: error,
        },
      ]);
      setError(null);
    }
  }, [error, selectedAgent]);

  // Show loading state while searching for agent
  if (agentSearch && agentsIsLoading) {
    return (
      <Box flexDirection="column">
        <Text color="green">
          Searching for agent matching "{agentSearch}"...
        </Text>
      </Box>
    );
  }

  // Fatal error state (only for unrecoverable errors before chat starts)
  if (agentsError) {
    return (
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1}>
          <Box marginY={1}>
            <Box borderStyle="round" borderColor="red" padding={1}>
              <Text>{agentsError}</Text>
            </Box>
          </Box>
        </Box>
        <Box marginTop={0}>
          <Text color="gray">Press Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }

  // Show agent selector only when explicitly requested via --sId (initial selection).
  if (requestedSId && !selectedAgent && !agentSearch) {
    return (
      <AgentSelector
        selectMultiple={false}
        requestedSIds={requestedSId ? [requestedSId] : []}
        onError={setError}
        onConfirm={async (agents) => {
          setSelectedAgent(agents[0]);
          setConversationItems([
            {
              key: "welcome_header",
              type: "welcome_header",
              agentName: agents[0].name,
              agentDescription: agents[0].description,
            },
          ]);
        }}
      />
    );
  }

  // Show loading while agents are loading and no agent is selected yet
  if (!selectedAgent && !agentsError) {
    return (
      <Box flexDirection="column">
        <Text color="green">
          Loading...
        </Text>
      </Box>
    );
  }

  const mentionPrefix = selectedAgent ? `@${selectedAgent.name} ` : "";

  // Main chat UI
  return (
    <Box flexDirection="column">
      {/* File upload component */}
      {pendingFiles.length > 0 && currentConversationId && (
        <FileUpload
          files={pendingFiles}
          onUploadComplete={handleFileUploadComplete}
          onUploadError={handleFileUploadError}
          conversationId={currentConversationId}
        />
      )}

      {/* Display uploaded files ready to be sent */}
      {uploadedFiles.length > 0 && !isUploadingFiles && (
        <Box flexDirection="column" marginY={1}>
          <Box borderStyle="round" borderColor="green" padding={1}>
            <Box flexDirection="column">
              <Text color="green" bold>
                📁 {uploadedFiles.length} file
                {uploadedFiles.length > 1 ? "s" : ""}
              </Text>

              {uploadedFiles.map((file) => {
                const isImage = isImageFile(file.contentType);

                return (
                  <Box key={file.path} flexDirection="column" marginTop={1}>
                    <Box>
                      <Text color={isImage ? "yellow" : "cyan"}>
                        {isImage ? "🖼️  " : "📄 "} {file.fileName}
                      </Text>
                      <Text color="gray">
                        {" "}
                        ({formatFileSize(file.fileSize)})
                      </Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      )}

      <Conversation
        conversationItems={conversationItems}
        isProcessingQuestion={isProcessingQuestion}
        userInput={
          inlineSelector
            ? inlineSelector.mode === "tool_approval"
              ? ""
              : inlineSelector.query
            : showCommandSelector
              ? `/${commandQuery}`
              : userInput
        }
        cursorPosition={
          inlineSelector
            ? inlineSelector.mode === "tool_approval"
              ? 0
              : inlineSelector.query.length
            : showCommandSelector
              ? commandCursorPosition + 1
              : cursorPosition
        }
        mentionPrefix={
          inlineSelector
            ? inlineSelector.mode === "agent"
              ? "Switch agent: "
              : inlineSelector.mode === "conversation"
                ? "Resume conversation: "
                : inlineSelector.mode === "file"
                  ? `📁 ${inlineSelector.currentPath ?? ""} `
                  : "Tool approval: "
            : mentionPrefix
        }
        conversationId={currentConversationId}
        stdout={stdout}
        showCommandSelector={showCommandSelector}
        commandQuery={commandQuery}
        selectedCommandIndex={selectedCommandIndex}
        commands={commands}
        autoAcceptEdits={autoAcceptEdits}
        streamingContent={streamingContent}
        streamingAgentName={streamingAgentName}
        streamingAgentState={streamingAgentState}
        streamingActionLabel={streamingActionLabel}
        streamingTimeline={streamingTimeline}
        pendingApproval={
          pendingApproval?.type === "tool_approve_execution"
            ? pendingApproval
            : null
        }
        pendingDiffApproval={pendingDiffApproval}
        onDiffApproval={handleDiffApproval}
        inlineSelector={
          inlineSelector
            ? {
                items: inlineSelector.items,
                query: inlineSelector.query,
                selectedIndex: inlineSelector.selectedIndex,
                prompt:
                  inlineSelector.mode === "agent"
                    ? "Select an agent:"
                    : inlineSelector.mode === "conversation"
                      ? "Select a conversation:"
                      : inlineSelector.mode === "file"
                        ? "Select a file:"
                        : "Use arrows to select, Enter to confirm:",
                header:
                  inlineSelector.mode === "tool_approval" &&
                  pendingApproval?.type === "tool_approve_execution" ? (
                    <ToolApprovalHeader event={pendingApproval} />
                  ) : undefined,
              }
            : null
        }
      />
    </Box>
  );
};

export default CliChat;
