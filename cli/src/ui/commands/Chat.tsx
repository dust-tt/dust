import type { CreateConversationResponseType } from "@dust-tt/client";
import type { AgentConfigurationType } from "@dust-tt/types";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import open from "open";
import type { FC } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import AuthService from "../../utils/authService.js";
import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import { useMe } from "../../utils/hooks/use_me.js";
import AgentSelector from "../components/AgentSelector.js";
import type { ConversationItem } from "../components/Conversation.js";
import Conversation from "../components/Conversation.js";

interface CliChatProps {
  requestedSId?: string; // sId from CLI flag
  initialAgentConfiguration: AgentConfigurationType | null; // Pre-fetched agent config for requestedSId
  allAgentConfigurations: AgentConfigurationType[] | null; // All available agents for selection
  isUsingCachedData?: boolean;
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
  requestedSId,
  initialAgentConfiguration,
  allAgentConfigurations,
  isUsingCachedData,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [agentConfiguration, setAgentConfiguration] =
    useState<AgentConfigurationType | null>(null);
  const [needsSelection, setNeedsSelection] = useState<boolean>(false);

  const [isProcessingQuestion, setIsProcessingQuestion] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationItems, setConversationItems] = useState<
    ConversationItem[]
  >([]);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [userInput, setUserInput] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);

  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<string>("");
  const chainOfThoughtRef = useRef<string>("");

  const { stdout } = useStdout();
  const { me, isLoading: isMeLoading, error: meError } = useMe();

  useEffect(() => {
    setError(null); // Clear previous errors on prop change
    if (initialAgentConfiguration) {
      setAgentConfiguration(initialAgentConfiguration);
      setNeedsSelection(false);
      setConversationItems([
        {
          key: "welcome_header",
          type: "welcome_header",
          agentName: initialAgentConfiguration.name,
          agentId: initialAgentConfiguration.sId,
          isCached: isUsingCachedData,
        },
      ]);
    } else if (requestedSId) {
      // initialAgentConfiguration is null, but an sId was requested
      setError(
        `Agent with sId "${requestedSId}" not found or not loaded. Try without -s to select from a list.`
      );
      setAgentConfiguration(null);
      setNeedsSelection(false);
    } else if (allAgentConfigurations && allAgentConfigurations.length > 0) {
      // No specific agent requested, and we have a list to choose from
      setNeedsSelection(true);
      setAgentConfiguration(null);
    } else if (allAgentConfigurations && allAgentConfigurations.length === 0) {
      setError("No agents available in this workspace.");
      setAgentConfiguration(null);
      setNeedsSelection(false);
    } else {
      // Still loading from App.tsx or other unhandled case
      setAgentConfiguration(null);
      setNeedsSelection(false); // Don't show selector if allAgentConfigurations is null (loading)
    }
  }, [
    requestedSId,
    initialAgentConfiguration,
    allAgentConfigurations,
    isUsingCachedData, // Added to update welcome header if cache status changes
  ]);

  // Effect to update welcome message if agent name changes (e.g. from background refresh)
  useEffect(() => {
    if (agentConfiguration) {
      setConversationItems((prev) =>
        prev.map((item) =>
          item.type === "welcome_header"
            ? {
                ...item,
                agentName: agentConfiguration.name,
                isCached: isUsingCachedData,
              }
            : item
        )
      );
    }
  }, [agentConfiguration?.name, isUsingCachedData]);

  const canSubmit =
    me &&
    !meError &&
    !isMeLoading &&
    !isProcessingQuestion &&
    !!userInput.trim() &&
    !!agentConfiguration;

  const handleSubmitQuestion = useCallback(
    async (questionText: string) => {
      if (!agentConfiguration || !me || meError || isMeLoading) {
        return;
      }

      // Append the user message and agent message header to the conversation items
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

        return [
          ...newItems,
          {
            key: newUserMessageKey,
            type: "user_message",
            firstName: me.firstName ?? "You",
            content: questionText,
            index: newUserMessageIndex,
          },
          {
            key: newAgentMessageHeaderKey,
            type: "agent_message_header",
            agentName: agentConfiguration.name,
            index: newAgentMessageHeaderIndex,
          },
        ];
      });

      setIsProcessingQuestion(true);
      const controller = new AbortController();
      setAbortController(controller);

      const dustClient = await getDustClient();
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsProcessingQuestion(false);
        setConversationItems((prev) => prev.slice(0, -1)); // Remove optimistic agent_message_header
        return;
      }

      let userMessageId: string;
      let conversation: CreateConversationResponseType["conversation"];

      try {
        // Either create a new conversation or add to an existing one
        if (!conversationId) {
          // Create a new conversation with the agent
          const convRes = await dustClient.createConversation({
            title: `CLI Question: ${questionText.substring(0, 30)}${
              questionText.length > 30 ? "..." : ""
            }`,
            visibility: "workspace",
            message: {
              content: questionText,
              mentions: [{ configurationId: agentConfiguration.sId }],
              context: {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                username: me.username,
                fullName: me.fullName,
                email: me.email,
                origin: "api",
              },
            },
            contentFragment: undefined,
          });

          if (convRes.isErr()) {
            throw new Error(
              `Failed to create conversation: ${convRes.error.message}`
            );
          }

          conversation = convRes.value.conversation;
          setConversationId(conversation.sId);

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
            conversationId: conversationId,
            message: {
              content: questionText,
              mentions: [{ configurationId: agentConfiguration.sId }],
              context: {
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
          const convRes = await dustClient.getConversation({ conversationId });
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
          } else if (event.type === "agent_message_success") {
            if (updateIntervalRef.current) {
              clearInterval(updateIntervalRef.current);
            }
            setError(null);
            pushFullLinesToConversationItems(false);
            chainOfThoughtRef.current = "";
            contentRef.current = "";
            break;
          }
        }
      } catch (err) {
        // Use 'err' to avoid conflict with outer 'error' state
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
              // This should not happen if logic is correct
              return [
                ...prev,
                {
                  key: `agent_message_cancelled_unknown`,
                  type: "agent_message_cancelled",
                },
              ];
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

        setError(`Error: ${normalizeError(err).message}`);
      } finally {
        setIsProcessingQuestion(false);
        setAbortController(null);
      }
    },
    [agentConfiguration, conversationId, me, meError, isMeLoading]
  );

  // Handle keyboard events
  useInput((input, key) => {
    // Ctrl+G to open conversation in browser
    if (key.ctrl && input === "g") {
      if (conversationId) {
        void (async () => {
          const workspaceId = await AuthService.getSelectedWorkspaceId();
          if (workspaceId) {
            const url = `https://dust.tt/w/${workspaceId}/assistant/${conversationId}`;
            await open(url);
          } else {
            console.error("\nCould not determine workspace ID");
          }
        })();
      }
      return;
    }

    // ESC key to either cancel ongoing request or clear input
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
    if (key.return) {
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

      void handleSubmitQuestion(userInput);
      setUserInput("");
      setCursorPosition(0);

      return;
    }

    if (key.backspace || key.delete) {
      if (cursorPosition > 0) {
        setUserInput(
          userInput.slice(0, cursorPosition - 1) +
            userInput.slice(cursorPosition)
        );
        setCursorPosition(Math.max(0, cursorPosition - 1));
      }
      return;
    }

    // Handle option+left (meta+b) to move to the previous word
    if (key.meta && input === "b" && cursorPosition > 0) {
      let newPosition = cursorPosition - 1;

      while (newPosition > 0 && /\s/.test(userInput[newPosition])) {
        newPosition--;
      }

      while (newPosition > 0 && !/\s/.test(userInput[newPosition - 1])) {
        newPosition--;
      }

      setCursorPosition(newPosition);
      return;
    }

    // Handle option+right (meta+f) to move to the next word
    if (key.meta && input === "f" && cursorPosition < userInput.length) {
      let newPosition = cursorPosition;

      while (
        newPosition < userInput.length &&
        !/\s/.test(userInput[newPosition])
      ) {
        newPosition++;
      }

      while (
        newPosition < userInput.length &&
        /\s/.test(userInput[newPosition])
      ) {
        newPosition++;
      }

      setCursorPosition(newPosition);
      return;
    }

    // Handle cmd+left (ctrl+a) to go to beginning of line
    if (key.ctrl && input === "a") {
      let newPosition = cursorPosition;

      while (newPosition > 0 && userInput[newPosition - 1] !== "\n") {
        newPosition--;
      }

      setCursorPosition(newPosition);
      return;
    }

    // Handle cmd+right (ctrl+e) to go to end of line
    if (key.ctrl && input === "e") {
      let newPosition = cursorPosition;

      while (
        newPosition < userInput.length &&
        userInput[newPosition] !== "\n"
      ) {
        newPosition++;
      }

      setCursorPosition(newPosition);
      return;
    }

    // Regular arrow key handling (left/right for character movement)
    if (key.leftArrow && cursorPosition > 0) {
      setCursorPosition(cursorPosition - 1);
      return;
    }

    if (key.rightArrow && cursorPosition < userInput.length) {
      setCursorPosition(cursorPosition + 1);
      return;
    }

    if (key.upArrow) {
      setCursorPosition(0);
      return;
    }

    if (key.downArrow) {
      setCursorPosition(userInput.length);
      return;
    }

    // Handle regular character input
    if (!key.ctrl && !key.meta && input && input.length === 1) {
      const newInput =
        userInput.slice(0, cursorPosition) +
        input +
        userInput.slice(cursorPosition);
      setUserInput(newInput);
      setCursorPosition(cursorPosition + 1);
    } else if (input.length > 1) {
      // This is a special case that can happen with some terminals when pasting
      // without explicit keyboard shortcuts - they send the entire pasted content
      // as a single input event

      // Some terminals translate newlines to \r, so we normalize that to \n
      const normalizedInput = input.replace(/\r/g, "\n");

      const newInput =
        userInput.slice(0, cursorPosition) +
        normalizedInput +
        userInput.slice(cursorPosition);
      setUserInput(newInput);
      setCursorPosition(cursorPosition + normalizedInput.length);
    }
  });

  // Render error state
  if (error) {
    return (
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1}>
          <Box marginY={1}>
            <Box borderStyle="round" borderColor="red" padding={1}>
              <Text>{error}</Text>
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

  // Render agent selector if needed
  if (needsSelection && allAgentConfigurations) {
    return (
      <AgentSelector
        availableAgents={allAgentConfigurations}
        selectMultiple={false}
        // requestedSIds is not directly applicable here as we are in selection mode
        onError={setError}
        onConfirm={(agents) => {
          if (agents && agents.length > 0 && agents[0]) {
            setAgentConfiguration(agents[0]);
            setNeedsSelection(false);
            setConversationItems([
              {
                key: "welcome_header",
                type: "welcome_header",
                agentName: agents[0].name,
                agentId: agents[0].sId,
                // isUsingCachedData will be from props, not relevant at selection confirm
              },
            ]);
          } else {
            setError("No agent selected. Exiting."); // Should not happen if AgentSelector works correctly
          }
        }}
      />
    );
  }

  // If no agent is configured (e.g. still loading from App.tsx, or error during init)
  if (!agentConfiguration) {
    // This handles the case where App.tsx hasn't provided initialAgentConfiguration,
    // and it's not yet time for selection (e.g. allAgentConfigurations is still null)
    return (
      <Box>
        <Text>
          <Spinner type="dots" /> Loading agent information...
        </Text>
      </Box>
    );
  }

  const mentionPrefix = agentConfiguration
    ? `@${agentConfiguration.name} `
    : "";

  // Main chat UI
  return (
    <Conversation
      conversationItems={conversationItems}
      isProcessingQuestion={isProcessingQuestion}
      userInput={userInput}
      cursorPosition={cursorPosition}
      mentionPrefix={mentionPrefix}
      conversationId={conversationId}
      stdout={stdout}
    />
  );
};

export default CliChat;
