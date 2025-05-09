import React, { FC, useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import open from "open";
import { getDustClient } from "../../utils/dustClient.js";
import AuthService from "../../utils/authService.js";
import {
  CreateConversationResponseType,
  GetAgentConfigurationsResponseType,
} from "@dust-tt/client";
import AgentSelector from "../components/AgentSelector.js";
import { useMe } from "../../utils/hooks/use_me.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface Message {
  type: "user" | "assistant";
  content: string;
  chainOfThought: string;
  isStreaming?: boolean;
}

interface CliChatProps {
  sId?: string;
  question?: string;
}

const CliChat: FC<CliChatProps> = ({
  sId: requestedSId,
  question: initialQuestion,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfiguration | null>(
    null
  );
  const [isProcessingQuestion, setIsProcessingQuestion] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [userInput, setUserInput] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const { stdout } = useStdout();
  // Debounce state and refs for token streaming
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseTextRef = useRef<string>("");
  const responseCotRef = useRef<string>("");

  const { me, isLoading: isMeLoading, error: meError } = useMe();

  const canSubmit =
    me &&
    !meError &&
    !isMeLoading &&
    !isProcessingQuestion &&
    !!userInput.trim();

  const handleSubmitQuestion = useCallback(
    async (questionText: string) => {
      if (!selectedAgent || !me || meError || isMeLoading) return;

      setMessages((prev) => [
        ...prev,
        { type: "user", content: questionText, chainOfThought: "" },
      ]);

      setMessages((prev) => [
        ...prev,
        {
          type: "assistant",
          content: "",
          chainOfThought: "",
          isStreaming: true,
        },
      ]);

      setIsProcessingQuestion(true);

      const controller = new AbortController();
      setAbortController(controller);

      const dustClient = await getDustClient();
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsProcessingQuestion(false);
        setMessages((prev) => prev.slice(0, -1)); // Remove the streaming message
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

          // Store the conversation ID for future messages
          conversation = convRes.value.conversation;
          setConversationId(conversation.sId);
          userMessageId = convRes.value.message.sId;
        } else {
          // Add a message to the existing conversation
          const workspaceId = await AuthService.getSelectedWorkspaceId();
          if (!workspaceId) {
            throw new Error("No workspace selected");
          }

          // Create a message in the existing conversation
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

        // Initialize response tracking with refs to avoid closure issues
        responseTextRef.current = "";
        responseCotRef.current = "";

        // Define a debounced update function
        const updateMessagesDebounced = () => {
          // Clear any existing timeout
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
          }

          // Set a new timeout for the update
          updateTimeoutRef.current = setTimeout(() => {
            const responseText = responseTextRef.current;
            const responseCot = responseCotRef.current;

            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.type === "assistant" && lastMessage.isStreaming) {
                // Format the chain of thought during streaming too
                // This will make it consistent as it's being updated
                const formattedCot = responseCot
                  .replace(/^\n+/, "") // Remove leading newlines
                  .replace(/\n{3,}/g, "\n\n") // Replace 3+ consecutive newlines with just 2
                  .replace(/\n+$/, ""); // Remove trailing newlines

                // Format the response text - remove leading newlines
                const formattedText = responseText.replace(/^\n+/, ""); // Remove leading newlines

                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  content: formattedText,
                  chainOfThought: formattedCot,
                };
              }
              return newMessages;
            });
          }, 10); // Very small debounce of 10ms to batch rapid updates
        };

        for await (const event of streamRes.value.eventStream) {
          if (event.type === "generation_tokens") {
            if (event.classification === "tokens") {
              responseTextRef.current += event.text;
            } else if (event.classification === "chain_of_thought") {
              responseCotRef.current += event.text;
            }

            // Update the streaming message with debouncing
            updateMessagesDebounced();
          } else if (event.type === "agent_error") {
            throw new Error(`Agent error: ${event.error.message}`);
          } else if (event.type === "user_message_error") {
            throw new Error(`User message error: ${event.error.message}`);
          } else if (event.type === "agent_message_success") {
            // Clear any existing timeout to ensure we're using the final values
            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
              updateTimeoutRef.current = null;
            }

            // Complete the message using the current values from refs
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.type === "assistant" && lastMessage.isStreaming) {
                // Format the chain of thought for the final message
                const formattedCot = responseCotRef.current
                  .replace(/^\n+/, "") // Remove leading newlines
                  .replace(/\n{3,}/g, "\n\n") // Replace 3+ consecutive newlines with just 2
                  .replace(/\n+$/, ""); // Remove trailing newlines

                // Format the response text - remove leading newlines
                const formattedText = responseTextRef.current.replace(
                  /^\n+/,
                  ""
                ); // Remove leading newlines

                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  content: formattedText,
                  chainOfThought: formattedCot,
                  isStreaming: false,
                };
              }
              return newMessages;
            });
            break;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          // The request was aborted, handled above
          return;
        }

        setError(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );

        // Update or remove the streaming message
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.type === "assistant" && lastMessage.isStreaming) {
            if (lastMessage.content) {
              // Keep what was streamed so far but mark as not streaming
              newMessages[newMessages.length - 1] = {
                ...lastMessage,
                isStreaming: false,
              };
            } else {
              // No content was streamed, add an error message
              newMessages[newMessages.length - 1] = {
                type: "assistant",
                content: `Error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                chainOfThought: "",
                isStreaming: false,
              };
            }
          }
          return newMessages;
        });
      } finally {
        setIsProcessingQuestion(false);
        setAbortController(null);
      }
    },
    [selectedAgent, conversationId, me, meError, isMeLoading]
  );

  // Handle initial question if provided
  useEffect(() => {
    if (
      selectedAgent &&
      initialQuestion &&
      messages.length === 0 &&
      canSubmit
    ) {
      handleSubmitQuestion(initialQuestion);
    }
  }, [
    selectedAgent,
    initialQuestion,
    handleSubmitQuestion,
    messages.length,
    canSubmit,
  ]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, []);

  // Handle keyboard events
  useInput((input, key) => {
    // Ctrl+G to open conversation in browser
    if (key.ctrl && input === "g") {
      if (conversationId) {
        (async () => {
          const workspaceId = await AuthService.getSelectedWorkspaceId();
          if (workspaceId) {
            const url = `https://dust.tt/w/${workspaceId}/assistant/${conversationId}`;
            console.log(`\nOpening conversation in browser: ${url}`);
            await open(url);
          } else {
            console.error("\nCould not determine workspace ID");
          }
        })();
      } else {
        console.log("\nNo active conversation to open");
      }
      return;
    }

    // ESC key to either cancel ongoing request or clear input
    if (key.escape) {
      if (isProcessingQuestion && abortController) {
        // Cancel ongoing request
        abortController.abort();
        setIsProcessingQuestion(false);

        // Update the streaming message to indicate cancellation
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage?.type === "assistant" && lastMessage.isStreaming) {
            newMessages[newMessages.length - 1] = {
              ...lastMessage,
              content: lastMessage.content + " [Cancelled]",
              isStreaming: false,
            };
          }
          return newMessages;
        });
      } else if (userInput) {
        // Clear input when not processing a request
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
      if (!canSubmit) return;

      handleSubmitQuestion(userInput);
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

  const renderMessages = () => {
    // Get terminal width for calculating right padding
    const terminalWidth = stdout?.columns || 80;
    const rightPadding = 4; // Number of characters to reserve for right padding

    return messages.map((message, index) => (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color={message.type === "user" ? "green" : "blue"}>
            {message.type === "user"
              ? `${me?.firstName ?? "You"}: `
              : `${selectedAgent?.name ?? "Assistant"}: `}
          </Text>
        </Box>
        <Box
          marginLeft={2}
          marginRight={rightPadding}
          flexDirection="column"
          width={terminalWidth - rightPadding - 2}
        >
          {message.type === "assistant" && message.chainOfThought && (
            <>
              {/* Chain of thought in gray italic */}
              <Text dimColor italic wrap="wrap">
                {
                  // Process chain of thought to prevent more than 2 consecutive empty lines
                  // and ensure the last line is not empty
                  message.chainOfThought
                    // Replace 3+ consecutive newlines with just 2 newlines
                    .replace(/\n{3,}/g, "\n\n")
                    // Remove trailing newlines
                    .replace(/\n+$/, "")
                }
              </Text>
              <Box marginBottom={1}></Box>
            </>
          )}

          {message.isStreaming ? (
            <Box flexDirection="column">
              <Text wrap="wrap">{message.content}</Text>
              <Box marginTop={1}>
                <Text color="green">
                  <Spinner type="dots" /> Thinking...
                </Text>
              </Box>
            </Box>
          ) : (
            <Text wrap="wrap">{message.content}</Text>
          )}
        </Box>
      </Box>
    ));
  };

  // Render error state
  if (error) {
    return (
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1}>
          {renderMessages()}

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
      {/* Welcome header */}
      <Box flexDirection="row" marginBottom={1}>
        <Box borderStyle="round" borderColor="gray" paddingX={1} paddingY={1}>
          <Box flexDirection="column">
            <Box justifyContent="center">
              <Text bold>Welcome to Dust CLI beta!</Text>
            </Box>
            <Box height={1}></Box>
            <Box justifyContent="center">
              <Text>
                You&apos;re currently chatting with {selectedAgent.name} (
                {selectedAgent.sId})
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

      <Box flexDirection="column" flexGrow={1}>
        {renderMessages()}
      </Box>

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
            ↵ to send · \↵ for new line · ESC to clear · Ctrl+G to open in
            browser
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default CliChat;
