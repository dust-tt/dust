import type {
  CreateConversationResponseType,
  GetAgentConfigurationsResponseType,
} from "@dust-tt/client";
import { Box, Text, useInput, useStdout } from "ink";
import open from "open";
import type { FC } from "react";
import React, { useCallback, useRef, useState } from "react";

import AuthService from "../../utils/authService.js";
import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import { useMe } from "../../utils/hooks/use_me.js";
import AgentSelector from "../components/AgentSelector.js";
import type { ConversationItem } from "../components/Conversation.js";
import Conversation from "../components/Conversation.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface CliChatProps {
  sId?: string;
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

  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef<string>("");
  const chainOfThoughtRef = useRef<string>("");

  const { stdout } = useStdout();

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

  const mentionPrefix = selectedAgent ? `@${selectedAgent.name} ` : "";

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
