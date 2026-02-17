import type {
  AgentActionSpecificEvent,
  ConversationPublicType,
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
import type { ConversationItem } from "../components/Conversation.js";
import Conversation from "../components/Conversation.js";
import { DiffApprovalSelector } from "../components/DiffApprovalSelector.js";
import type { UploadedFile } from "../components/FileUpload.js";
import { FileUpload } from "../components/FileUpload.js";
import type { InlineSelectorItem } from "../components/InlineSelector.js";
import { ToolApprovalSelector } from "../components/ToolApprovalSelector.js";
import { resolveSpaceId, validateProjectFlags } from "./chat/nonInteractive.js";
import { createCommands } from "./types.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface CliChatProps {
  sId?: string;
  agentSearch?: string;
  conversationId?: string;
  autoAcceptEditsFlag?: boolean;
  projectName?: string;
  projectId?: string;
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

function buildConversationItemsFromHistory(
  conv: ConversationPublicType,
  agent: { name: string; description: string }
): ConversationItem[] {
  const items: ConversationItem[] = [
    {
      key: "welcome_header",
      type: "welcome_header",
      agentName: agent.name,
      agentDescription: agent.description,
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
        items.push({
          key: `resumed_agent_header_${agentMsgIdx}`,
          type: "agent_message_header",
          agentName: msg.configuration.name,
          index: agentMsgIdx,
        });
        if (msg.content) {
          const contentLines = msg.content.trim().split("\n");
          for (let i = 0; i < contentLines.length; i++) {
            items.push({
              key: `resumed_agent_content_${agentMsgIdx}_${i}`,
              type: "agent_message_content_line",
              text: contentLines[i] || " ",
              index: i,
            });
          }
        }
        items.push({
          key: `resumed_agent_sep_${agentMsgIdx}`,
          type: "separator",
        });
        agentMsgIdx++;
      }
    }
  }

  return items;
}

const CliChat: FC<CliChatProps> = ({
  sId: requestedSId,
  agentSearch,
  conversationId,
  autoAcceptEditsFlag,
  projectName,
  projectId,
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
    mode: "agent" | "file" | "conversation";
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
  const [resolvedSpaceId, setResolvedSpaceId] = useState<string | undefined>(
    undefined
  );
  const [isResolvingSpace, setIsResolvingSpace] = useState(
    !!(projectName || projectId)
  );
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<string>("");
  const chainOfThoughtRef = useRef<string>("");
  const resumeLoadedRef = useRef(false);

  const { stdout } = useStdout();

  const { me, isLoading: isMeLoading, error: meError } = useMe();

  // Import useAgents hook for agent search functionality
  const {
    allAgents,
    error: agentsError,
    isLoading: agentsIsLoading,
  } = useAgents();

  // Validate and resolve spaceId from projectName or projectId
  useEffect(() => {
    // Validate flags first - fail fast before any async operations
    const validationError = validateProjectFlags(
      projectName,
      projectId,
      conversationId ?? undefined
    );
    if (validationError) {
      setError(validationError);
      setIsResolvingSpace(false);
      return;
    }

    if (!projectName && !projectId) {
      setIsResolvingSpace(false);
      return;
    }

    async function resolveSpace() {
      const dustClientRes = await getDustClient();
      if (dustClientRes.isErr()) {
        setError(dustClientRes.error.message);
        setIsResolvingSpace(false);
        return;
      }

      const dustClient = dustClientRes.value;
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsResolvingSpace(false);
        return;
      }

      try {
        const spaceId = await resolveSpaceId(
          dustClient,
          projectName,
          projectId
        );
        setResolvedSpaceId(spaceId);
      } catch (error) {
        setError(normalizeError(error).message);
      } finally {
        setIsResolvingSpace(false);
      }
    }

    void resolveSpace();
  }, [projectName, projectId, conversationId]);

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

      // For low/high stake, prompt user for approval
      return new Promise<boolean>((resolve) => {
        setPendingApproval(event);
        setApprovalResolver(() => resolve);
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
        spaceId: resolvedSpaceId,
      });

      if (convRes.isErr()) {
        setError(`Failed to create conversation: ${convRes.error.message}`);
        return null;
      }

      setCurrentConversationId(convRes.value.conversation.sId);
      return convRes.value.conversation.sId;
    },
    [selectedAgent, me, meError, isMeLoading, resolvedSpaceId]
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
    const helpText =
      "Commands: /help /switch /new /resume /attach /clear-files /auto /exit\n" +
      "Shortcuts: Enter=send  \\Enter=newline  ESC=clear/cancel  Ctrl+G=open in browser";
    const lines = helpText.split("\n");
    setConversationItems((prev) => [
      ...prev,
      ...lines.map((line, i) => ({
        key: `help_line_${Date.now()}_${i}`,
        type: "agent_message_content_line" as const,
        text: line,
        index: 0,
      })),
      { key: `help_sep_${Date.now()}`, type: "separator" as const },
    ]);
  }, []);

  const handleConversationSelected = useCallback(
    async (convSId: string) => {
      setConversationItems((prev) => [
        ...prev,
        {
          key: `loading_conv_${Date.now()}`,
          type: "agent_message_content_line" as const,
          text: "Loading conversation...",
          index: 0,
        },
      ]);

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

      setCurrentConversationId(convSId);
      const items = buildConversationItemsFromHistory(convRes.value, {
        name: selectedAgent?.name ?? "dust",
        description: selectedAgent?.description ?? "",
      });

      await clearTerminal();
      setConversationItems(items);
    },
    [selectedAgent]
  );

  const resumeConversation = useCallback(async () => {
    setConversationItems((prev) => [
      ...prev,
      {
        key: `loading_resume_${Date.now()}`,
        type: "agent_message_content_line" as const,
        text: "Loading conversations...",
        index: 0,
      },
    ]);

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
          type: "agent_message_content_line" as const,
          text: "No recent conversations found.",
          index: 0,
        },
        { key: `resume_sep_${Date.now()}`, type: "separator" as const },
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

  const commands = createCommands({
    triggerAgentSwitch,
    clearFiles,
    attachFile: showAttachDialog,
    toggleAutoEdits,
    startNewConversation,
    showHelp,
    resumeConversation,
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

  // Auto-initialize filesystem server when agent is selected.
  useEffect(() => {
    if (!selectedAgent || fileSystemInitialized) {
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
  }, [selectedAgent, fileSystemInitialized, requestDiffApproval]);

  // Load conversation history when resuming via --resume
  useEffect(() => {
    if (!conversationId || !selectedAgent || resumeLoadedRef.current) {
      return;
    }
    resumeLoadedRef.current = true;

    setConversationItems((prev) => [
      ...prev,
      {
        key: `loading_resume_init_${Date.now()}`,
        type: "agent_message_content_line" as const,
        text: "Loading conversation...",
        index: 0,
      },
    ]);

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
        setError(`Failed to load conversation: ${convRes.error.message}`);
        return;
      }

      const items = buildConversationItemsFromHistory(convRes.value, {
        name: selectedAgent.name,
        description: selectedAgent.description,
      });

      await clearTerminal();
      setConversationItems(items);
    })();
  }, [conversationId, selectedAgent]);

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

      setConversationItems((prev) => {
        const lastUserMessage = getLastConversationItem<
          ConversationItem & { type: "user_message" }
        >(prev, "user_message");

        const newUserMessageIndex = lastUserMessage
          ? lastUserMessage.index + 1
          : 0;
        const newUserMessageKey = `user_message_${newUserMessageIndex}`;

        const lastAgentMessageHeader = getLastConversationItem<
          ConversationItem & { type: "agent_message_header" }
        >(prev, "agent_message_header");

        const newAgentMessageHeaderIndex = lastAgentMessageHeader
          ? lastAgentMessageHeader.index + 1
          : 0;
        const newAgentMessageHeaderKey = `agent_message_header_${newAgentMessageHeaderIndex}`;

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

        itemsToAdd.push({
          key: newAgentMessageHeaderKey,
          type: "agent_message_header",
          agentName: selectedAgent.name,
          index: newAgentMessageHeaderIndex,
        });

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
            spaceId: resolvedSpaceId,
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

        const pushFullLinesToConversationItems = (isStreaming: boolean) => {
          // If isStreaming is true, we only consider lines are full up to the penultimate line,
          // as we have no guarantee the last line is complete.
          // If isStreaming is false, we consider all lines to be complete.
          const cotLines = chainOfThoughtRef.current.split("\n");
          const contentLines = contentRef.current.split("\n");

          setConversationItems((prev) => {
            // Remove leading empty lines
            while (cotLines.length > 0 && cotLines[0] === "") {
              cotLines.shift();
            }
            while (contentLines.length > 0 && contentLines[0] === "") {
              contentLines.shift();
            }

            const lastAgentMessageHeader = getLastConversationItem<
              ConversationItem & { type: "agent_message_header" }
            >(prev, "agent_message_header");

            if (!lastAgentMessageHeader) {
              throw new Error("Unreachable: No agent message header found");
            }

            const agentMessageIndex = lastAgentMessageHeader.index;

            const prevIds = new Set(prev.map((item) => item.key));

            const contentItems = contentLines
              .map(
                (line, index) =>
                  ({
                    key: `agent_message_content_line_${agentMessageIndex}__${index}`,
                    type: "agent_message_content_line",
                    text: line || " ",
                    index,
                  }) satisfies ConversationItem & {
                    type: "agent_message_content_line";
                  }
              )
              .filter((item) => !prevIds.has(item.key))
              .slice(0, isStreaming ? -1 : undefined);

            const newItems = [...prev];

            const hasContentLines =
              newItems[newItems.length - 1].type ===
              "agent_message_content_line";

            // If we already inserted some content lines for the agent message, we don't insert more cot lines, even if
            // the agent generated some additional ones.
            if (!hasContentLines) {
              const cotItems = cotLines
                .map(
                  (line, index) =>
                    ({
                      key: `agent_message_cot_line_${agentMessageIndex}__${index}`,
                      type: "agent_message_cot_line",
                      text: line,
                      index,
                    }) satisfies ConversationItem & {
                      type: "agent_message_cot_line";
                    }
                )
                .filter((item) => !prevIds.has(item.key))
                .slice(0, isStreaming && !contentItems.length ? -1 : undefined);

              newItems.push(...cotItems);
            }

            const hasCotLines =
              newItems[newItems.length - 1].type === "agent_message_cot_line";

            if (!hasContentLines && hasCotLines && contentLines.length > 0) {
              // This is the first content line, and we have some previous cot lines.
              // So we insert a separator to separate the cot from the content.
              newItems.push({
                key: `end_of_cot_separator_${agentMessageIndex}`,
                type: "separator",
              });
            }

            newItems.push(...contentItems);

            // If we are done streaming, we insert a separator below the completed agent message.
            if (!isStreaming) {
              newItems.push({
                key: `end_of_agent_message_separator_${agentMessageIndex}`,
                type: "separator",
              });
            }

            return newItems;
          });
        };

        updateIntervalRef.current = setInterval(() => {
          pushFullLinesToConversationItems(true);
        }, 1000);

        for await (const event of streamRes.value.eventStream) {
          if (event.type === "generation_tokens") {
            if (event.classification === "tokens") {
              contentRef.current += event.text;
            } else if (event.classification === "chain_of_thought") {
              chainOfThoughtRef.current += event.text;
            }
          } else if (event.type === "agent_error") {
            throw new Error(`Agent error: ${event.error.message}`);
          } else if (event.type === "user_message_error") {
            throw new Error(`User message error: ${event.error.message}`);
          } else if (event.type === "agent_generation_cancelled") {
            // Handle generation cancellation
            if (updateIntervalRef.current) {
              clearInterval(updateIntervalRef.current);
            }
            setActionStatus(null);
            setError(null);
            pushFullLinesToConversationItems(false);
            chainOfThoughtRef.current = "";
            contentRef.current = contentRef.current || "[Cancelled]";
            pushFullLinesToConversationItems(false);
            contentRef.current = "";
            break;
          } else if (event.type === "agent_message_success") {
            if (updateIntervalRef.current) {
              clearInterval(updateIntervalRef.current);
            }
            setActionStatus(null);
            setError(null);
            pushFullLinesToConversationItems(false);
            chainOfThoughtRef.current = "";
            contentRef.current = "";
            break;
          } else if (event.type === "tool_params") {
            setActionStatus(
              event.action.displayLabels?.running ?? "Running a tool"
            );
          } else if (event.type === "agent_action_success") {
            setActionStatus(null);
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
          setActionStatus(null);
          if (updateIntervalRef.current) {
            clearInterval(updateIntervalRef.current);
          }

          setConversationItems((prev) => {
            const lastAgentMessageHeader = getLastConversationItem<
              ConversationItem & { type: "agent_message_header" }
            >(prev, "agent_message_header");

            if (!lastAgentMessageHeader) {
              throw new Error("Unreachable: No agent message header found");
            }

            return [
              ...prev,
              {
                key: `agent_message_cancelled_${lastAgentMessageHeader.index}`,
                type: "agent_message_cancelled",
              },
            ];
          });

          chainOfThoughtRef.current = "";
          contentRef.current = "";

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
      resolvedSpaceId,
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
    // Skip input handling when there's a pending approval
    if (pendingApproval || pendingDiffApproval) {
      return;
    }

    if (!selectedAgent) {
      return;
    }

    // Handle inline selector keyboard (agent switch, file browser).
    if (inlineSelector) {
      if (key.escape) {
        setInlineSelector(null);
        return;
      }

      const filtered = inlineSelector.items.filter((item) =>
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
                selectedIndex: Math.min(
                  visibleCount - 1,
                  prev.selectedIndex + 1
                ),
              }
            : prev
        );
        return;
      }

      if (key.return) {
        if (
          filtered.length > 0 &&
          inlineSelector.selectedIndex < filtered.length
        ) {
          const selected = filtered[inlineSelector.selectedIndex];

          if (inlineSelector.mode === "agent") {
            const agent = (allAgents || []).find((a) => a.sId === selected.id);
            if (agent) {
              setSelectedAgent(agent);
              setConversationItems((prev) => [
                ...prev,
                {
                  key: `switch_${Date.now()}`,
                  type: "agent_message_content_line",
                  text: `Switched to @${agent.name}`,
                  index: 0,
                },
                { key: `switch_sep_${Date.now()}`, type: "separator" },
              ]);
            }
            setInlineSelector(null);
          } else if (inlineSelector.mode === "file") {
            if (selected.id === "__more__") {
              return;
            }
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
                  const ext = getFileExtension(selected.id);
                  if (isSupportedFileType(ext)) {
                    setInlineSelector(null);
                    await handleFileSelected(selected.id);
                  }
                }
              } catch {
                setInlineSelector(null);
              }
            })();
          } else if (inlineSelector.mode === "conversation") {
            void handleConversationSelected(selected.id);
            setInlineSelector(null);
          }
        }
        return;
      }

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
      }
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

  // Show loading state while resolving project/space
  if (isResolvingSpace) {
    return (
      <Box flexDirection="column">
        <Text color="green">
          Resolving project "{projectName || projectId}"...
        </Text>
      </Box>
    );
  }

  // Render error state
  if (error || agentsError) {
    return (
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1}>
          <Box marginY={1}>
            <Box borderStyle="round" borderColor="red" padding={1}>
              <Text>{error || agentsError}</Text>
            </Box>
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={0} paddingTop={0}>
          <Box marginTop={0}>
            <Text color="gray">Press Ctrl+C to exit</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (!selectedAgent && !agentSearch) {
    // If no --sId flag and no agent search, wait for auto-select to kick in
    if (!requestedSId) {
      return (
        <Box flexDirection="column">
          <Text color="green">Loading...</Text>
        </Box>
      );
    }

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

  const mentionPrefix = selectedAgent ? `@${selectedAgent.name} ` : "";

  // Show approval prompt if pending
  if (pendingApproval) {
    if (pendingApproval.type !== "tool_approve_execution") {
      setError(`Unexpected pending approval type: ${pendingApproval.type}`);
      return null; // Exit early if we encounter an unexpected type
    }

    return (
      <ToolApprovalSelector
        event={pendingApproval}
        onApproval={async (approved, cachedApproval) => {
          await clearTerminal();
          await handleApproval(approved, cachedApproval);
        }}
      />
    );
  }

  // Show diff approval prompt if pending
  if (pendingDiffApproval) {
    return (
      <DiffApprovalSelector
        originalContent={pendingDiffApproval.originalContent}
        updatedContent={pendingDiffApproval.updatedContent}
        filePath={pendingDiffApproval.filePath}
        onApproval={async (approved) => {
          await clearTerminal();
          await handleDiffApproval(approved);
        }}
      />
    );
  }

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
        actionStatus={actionStatus}
        userInput={inlineSelector ? inlineSelector.query : userInput}
        cursorPosition={
          inlineSelector ? inlineSelector.query.length : cursorPosition
        }
        mentionPrefix={
          inlineSelector
            ? inlineSelector.mode === "agent"
              ? "Switch agent: "
              : inlineSelector.mode === "file"
                ? `📁 ${inlineSelector.currentPath ?? ""} `
                : inlineSelector.mode === "conversation"
                  ? "Resume conversation: "
                  : mentionPrefix
            : mentionPrefix
        }
        conversationId={currentConversationId}
        stdout={stdout}
        showCommandSelector={showCommandSelector}
        commandQuery={commandQuery}
        selectedCommandIndex={selectedCommandIndex}
        commandCursorPosition={commandCursorPosition}
        commands={commands}
        autoAcceptEdits={autoAcceptEdits}
        inlineSelector={
          inlineSelector
            ? {
                items: inlineSelector.items,
                query: inlineSelector.query,
                selectedIndex: inlineSelector.selectedIndex,
                prompt:
                  inlineSelector.mode === "agent"
                    ? "Select an agent:"
                    : inlineSelector.mode === "file"
                      ? "Select a file:"
                      : inlineSelector.mode === "conversation"
                        ? "Select a conversation:"
                        : undefined,
              }
            : null
        }
      />
    </Box>
  );
};

export default CliChat;
