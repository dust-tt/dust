import type {
  AgentActionSpecificEvent,
  CreateConversationResponseType,
  GetAgentConfigurationsResponseType,
} from "@dust-tt/client";
import { Box, Text, useInput, useStdout } from "ink";
import open from "open";
import type { FC } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useFileSystemServer } from "../../mcp/servers/fsServer.js";
import AuthService from "../../utils/authService.js";
import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import type { FileInfo } from "../../utils/fileHandling.js";
import {
  formatFileSize,
  isImageFile,
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
import FileAccessSelector from "../components/FileAccessSelector.js";
import { FileSelector } from "../components/FileSelector.js";
import type { UploadedFile } from "../components/FileUpload.js";
import { FileUpload } from "../components/FileUpload.js";
import { ToolApprovalSelector } from "../components/ToolApprovalSelector.js";
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
  const [isSelectingNewAgent, setIsSelectingNewAgent] = useState(false);
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
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [chosenFileSystemUsage, setChosenFileSystemUsage] = useState(false);
  const [fileSystemServerId, setFileSystemServerId] = useState<string | null>(
    null
  );
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<string>("");
  const chainOfThoughtRef = useRef<string>("");

  const { stdout } = useStdout();

  const { me, isLoading: isMeLoading, error: meError } = useMe();

  // Import useAgents hook for agent search functionality
  const {
    allAgents,
    error: agentsError,
    isLoading: agentsIsLoading,
  } = useAgents();

  const triggerAgentSwitch = useCallback(async () => {
    // Clear all input states before switching.
    setUserInput("");
    setCursorPosition(0);
    setShowCommandSelector(false);
    setCommandQuery("");
    setSelectedCommandIndex(0);
    setCommandCursorPosition(0);

    await clearTerminal();
    setIsSelectingNewAgent(true);
  }, []);

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
    await clearTerminal();
    setShowFileSelector(true);
  }, []);

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
      setShowFileSelector(false);
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

  const handleFileSelectorCancel = useCallback(() => {
    setShowFileSelector(false);
  }, []);

  const commands = createCommands({
    triggerAgentSwitch,
    clearFiles,
    attachFile: showAttachDialog,
    toggleAutoEdits,
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
        agentId: agentToSelect.sId,
      },
    ]);
  }, [agentSearch, allAgents, selectedAgent]);

  useEffect(() => {
    autoAcceptEditsRef.current = autoAcceptEdits;
  }, [autoAcceptEdits]);

  const canSubmit =
    me &&
    !meError &&
    !isMeLoading &&
    !isProcessingQuestion &&
    !isSelectingNewAgent &&
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
                origin: "api",
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
                origin: "api",
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
                  } satisfies ConversationItem & {
                    type: "agent_message_content_line";
                  })
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
                    } satisfies ConversationItem & {
                      type: "agent_message_cot_line";
                    })
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
            setError(null);
            pushFullLinesToConversationItems(false);
            chainOfThoughtRef.current = "";
            contentRef.current = "";
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

    if (!selectedAgent || isSelectingNewAgent || showFileSelector) {
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

  if (showFileSelector) {
    return (
      <FileSelector
        onSelect={handleFileSelected}
        onCancel={handleFileSelectorCancel}
      />
    );
  }

  if ((!selectedAgent || isSelectingNewAgent) && !agentSearch) {
    const isInitialSelection = !selectedAgent;

    return (
      <AgentSelector
        selectMultiple={false}
        requestedSIds={isInitialSelection && requestedSId ? [requestedSId] : []}
        onError={setError}
        onConfirm={async (agents) => {
          setSelectedAgent(agents[0]);

          if (isInitialSelection) {
            setConversationItems([
              {
                key: "welcome_header",
                type: "welcome_header",
                agentName: agents[0].name,
                agentId: agents[0].sId,
              },
            ]);
          } else {
            setIsSelectingNewAgent(false);

            setUserInput("");
            setCursorPosition(0);
            setShowCommandSelector(false);
            setCommandQuery("");
            setSelectedCommandIndex(0);
            setCommandCursorPosition(0);

            // Clear terminal and force re-render.
            await clearTerminal();
          }
        }}
      />
    );
  }

  if ((selectedAgent || !isSelectingNewAgent) && !chosenFileSystemUsage) {
    return (
      <FileAccessSelector
        selectMultiple={false}
        onConfirm={async (selectedModelFileAccess) => {
          if (selectedModelFileAccess[0].id === "y") {
            const dustClientRes = await getDustClient();
            if (dustClientRes.isErr()) {
              setError(dustClientRes.error.message);
              return;
            }

            const dustClient = dustClientRes.value;
            if (!dustClient) {
              setError("No Dust API set.");
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
          }
          setChosenFileSystemUsage(true);
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
        userInput={userInput}
        cursorPosition={cursorPosition}
        mentionPrefix={mentionPrefix}
        conversationId={currentConversationId}
        stdout={stdout}
        showCommandSelector={showCommandSelector}
        commandQuery={commandQuery}
        selectedCommandIndex={selectedCommandIndex}
        commandCursorPosition={commandCursorPosition}
        commands={commands}
        autoAcceptEdits={autoAcceptEdits}
      />
    </Box>
  );
};

export default CliChat;
