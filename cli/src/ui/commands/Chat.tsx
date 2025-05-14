import type {
  CreateConversationResponseType,
  GetAgentConfigurationsResponseType,
} from "@dust-tt/client";
import { assertNever } from "@dust-tt/client";
import { Box, Static, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import open from "open";
import type { FC } from "react";
import React, { useCallback, useRef, useState } from "react";

import AuthService from "../../utils/authService.js";
import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import { useMe } from "../../utils/hooks/use_me.js";
import AgentSelector from "../components/AgentSelector.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface CliChatProps {
  sId?: string;
}

type ConversationItem = { key: string } & (
  | {
      type: "welcome_header";
      agentName: string;
      agentId: string;
    }
  | {
      type: "user_message";
      firstName: string;
      content: string;
      index: number;
    }
  | {
      type: "agent_message_header";
      agentName: string;
      index: number;
    }
  | {
      type: "agent_message_cot_line";
      text: string;
      index: number;
    }
  | {
      type: "agent_message_content_line";
      text: string;
      index: number;
    }
  | {
      type: "agent_message_cancelled";
    }
  | {
      type: "separator";
    }
);

function getLast<T extends ConversationItem>(
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

const StaticConversationItem: FC<{
  item: ConversationItem;
  stdout: NodeJS.WriteStream | null;
}> = ({ item, stdout }) => {
  const terminalWidth = stdout?.columns || 80;
  const rightPadding = 4;

  switch (item.type) {
    case "welcome_header":
      return (
        <Box flexDirection="row" marginBottom={1}>
          <Box borderStyle="round" borderColor="gray" paddingX={1} paddingY={1}>
            <Box flexDirection="column">
              <Box justifyContent="center">
                <Text bold>Welcome to Dust CLI beta!</Text>
              </Box>
              <Box height={1}></Box>
              <Box justifyContent="center">
                <Text>
                  You&apos;re currently chatting with {item.agentName} (
                  {item.agentId})
                </Text>
              </Box>
              <Box height={1}></Box>
              <Box justifyContent="center">
                <Text dimColor>
                  Type your message below and press Enter to send
                </Text>
              </Box>
            </Box>
          </Box>
          <Box></Box>
        </Box>
      );
    case "user_message":
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="green">
              {item.firstName ?? "You"}
            </Text>
          </Box>
          <Box
            marginLeft={2}
            marginRight={rightPadding}
            flexDirection="column"
            width={terminalWidth - rightPadding - 2}
          >
            <Text wrap="wrap">
              {item.content.replace(/^\n+/, "").replace(/\n+$/, "")}
            </Text>
          </Box>
        </Box>
      );
    case "agent_message_header":
      return (
        <Box>
          <Text bold color="blue">
            {item.agentName}
          </Text>
        </Box>
      );
    case "agent_message_cot_line":
      return (
        <Box marginLeft={2}>
          <Text dimColor italic>
            {item.text}
          </Text>
        </Box>
      );
    case "agent_message_content_line":
      return (
        <Box marginLeft={2}>
          <Text>{item.text}</Text>
        </Box>
      );
    case "agent_message_cancelled":
      return (
        <Box marginBottom={1} marginTop={1}>
          <Text color="red">[Cancelled]</Text>
        </Box>
      );
    case "separator":
      return <Box height={1}></Box>;
    default:
      assertNever(item);
  }
};

const CliChat: FC<CliChatProps> = ({ sId: requestedSId }) => {
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfiguration | null>(
    null
  );
  const [isProcessingQuestion, setIsProcessingQuestion] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationItems, setConversationItems] = useState<
    ConversationItem[]
  >([]);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [userInput, setUserInput] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const { stdout } = useStdout();
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<string>("");
  const chainOfThoughtRef = useRef<string>("");

  const { me, isLoading: isMeLoading, error: meError } = useMe();

  const canSubmit =
    me &&
    !meError &&
    !isMeLoading &&
    !isProcessingQuestion &&
    !!userInput.trim();

  const handleSubmitQuestion = useCallback(
    async (questionText: string) => {
      if (!selectedAgent || !me || meError || isMeLoading) {
        return;
      }

      // Append the user message and agent message header to the conversation items
      setConversationItems((prev) => {
        const lastUserMessage = getLast<
          ConversationItem & { type: "user_message" }
        >(prev, "user_message");

        const newUserMessageIndex = lastUserMessage
          ? lastUserMessage.index + 1
          : 0;
        const newUserMessageKey = `user_message_${newUserMessageIndex}`;

        const lastAgentMessageHeader = getLast<
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
            agentName: selectedAgent.name,
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
        setConversationItems((prev) => prev.slice(0, -1));
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
              mentions: [{ configurationId: selectedAgent.sId }],
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
              mentions: [{ configurationId: selectedAgent.sId }],
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

            const lastAgentMessageHeader = getLast<
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
      } catch (error) {
        if (controller.signal.aborted) {
          setAbortController(null);
          if (updateIntervalRef.current) {
            clearInterval(updateIntervalRef.current);
          }

          setConversationItems((prev) => {
            const lastAgentMessageHeader = getLast<
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
    [selectedAgent, conversationId, me, meError, isMeLoading]
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

  // Render agent selector
  if (!selectedAgent) {
    return (
      <AgentSelector
        selectMultiple={false}
        requestedSIds={requestedSId ? [requestedSId] : []}
        onError={setError}
        onConfirm={(agents) => {
          setSelectedAgent(agents[0]);
          setConversationItems([
            {
              key: "welcome_header",
              type: "welcome_header",
              agentName: agents[0].name,
              agentId: agents[0].sId,
            },
          ]);
        }}
      />
    );
  }

  // Calculate input box dimensions
  const inputWidth = stdout?.columns ? stdout.columns - 10 : 70;
  const mentionPrefix = selectedAgent ? `@${selectedAgent.name} ` : "";
  const prefixLength = mentionPrefix.length;

  // Calculate cursor display without modifying the original input
  const displayInput =
    userInput.length <= inputWidth - prefixLength
      ? userInput
      : userInput.slice(
          Math.max(
            0,
            cursorPosition - Math.floor((inputWidth - prefixLength) / 2)
          ),
          cursorPosition + Math.ceil((inputWidth - prefixLength) / 2)
        );

  const visibleCursorPosition =
    userInput.length <= inputWidth - prefixLength
      ? cursorPosition
      : Math.min(
          inputWidth - prefixLength,
          cursorPosition -
            Math.max(
              0,
              cursorPosition - Math.floor((inputWidth - prefixLength) / 2)
            )
        );

  // Create a display string with cursor
  const beforeCursor = displayInput.slice(0, visibleCursorPosition);
  // Always show a space for the cursor position, even when the input is empty
  const atCursor = displayInput.charAt(visibleCursorPosition) || " ";
  const afterCursor = displayInput.slice(visibleCursorPosition + 1);

  // Main chat UI
  return (
    <Box flexDirection="column" height="100%">
      <Static items={conversationItems}>
        {(item) => {
          return (
            <StaticConversationItem
              item={item}
              stdout={stdout}
              key={item.key}
            />
          );
        }}
      </Static>

      {isProcessingQuestion && (
        <Box marginTop={1}>
          <Text color="green">
            Thinking <Spinner type="simpleDots" />
          </Text>
        </Box>
      )}

      {/* Input box */}
      <Box flexDirection="column" marginTop={0} paddingTop={0}>
        <Box
          borderStyle="round"
          borderColor="gray"
          padding={0}
          paddingX={1}
          marginTop={0}
        >
          {userInput.includes("\n") ? (
            // Multiline
            <Box flexDirection="column">
              {(() => {
                // Find which line and position the cursor is on
                let currentPos = 0;
                const lines = userInput.split("\n");
                const cursorLine = lines.findIndex((line) => {
                  if (
                    cursorPosition >= currentPos &&
                    cursorPosition <= currentPos + line.length
                  ) {
                    return true;
                  }
                  currentPos += line.length + 1; // +1 for the \n character
                  return false;
                });

                const cursorPosInLine =
                  cursorLine >= 0
                    ? cursorPosition -
                      (cursorLine === 0
                        ? 0
                        : lines
                            .slice(0, cursorLine)
                            .reduce((sum, line) => sum + line.length + 1, 0))
                    : 0;

                return lines.map((line, index) => (
                  <Box key={index}>
                    {index === 0 && (
                      <Text color={isProcessingQuestion ? "gray" : "cyan"} bold>
                        {mentionPrefix}
                      </Text>
                    )}

                    {index === cursorLine ? (
                      // This is the line with the cursor
                      <>
                        <Text>{line.substring(0, cursorPosInLine)}</Text>
                        <Text
                          backgroundColor={
                            isProcessingQuestion ? "gray" : "blue"
                          }
                          color="white"
                        >
                          {line.charAt(cursorPosInLine) || " "}
                        </Text>
                        <Text>{line.substring(cursorPosInLine + 1)}</Text>
                      </>
                    ) : (
                      // Regular line without cursor
                      // For empty lines, just render a space to ensure the line is visible
                      <Text>{line === "" ? " " : line}</Text>
                    )}
                  </Box>
                ));
              })()}
            </Box>
          ) : (
            // Single line
            <Box>
              <Text color={isProcessingQuestion ? "gray" : "cyan"} bold>
                {mentionPrefix}
              </Text>
              <Text>{beforeCursor}</Text>
              <Text
                backgroundColor={isProcessingQuestion ? "gray" : "blue"}
                color="white"
              >
                {atCursor}
              </Text>
              <Text>{afterCursor}</Text>
            </Box>
          )}
        </Box>

        <Box marginTop={0}>
          <Text dimColor>
            ↵ to send · \↵ for new line · ESC to clear
            {conversationId && "· Ctrl+G to open in browser"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default CliChat;
