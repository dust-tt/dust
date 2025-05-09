import React, { FC, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { getDustClient } from "../../utils/dustClient.js";
import AuthService from "../../utils/authService.js";
import { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import process from "process";
import { createInterface } from "readline";
import { useClearTerminalOnMount } from "../../utils/hooks/use_clear_terminal_on_mount.js";
import AgentSelector from "../components/AgentSelector.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface AskAgentProps {
  sId?: string;
  question?: string;
}

const AskAgent: FC<AskAgentProps> = ({
  sId: requestedSId,
  question: initialQuestion,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfiguration | null>(
    null
  );
  const [question, setQuestion] = useState<string | null>(
    initialQuestion || null
  );
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [isProcessingQuestion, setIsProcessingQuestion] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ question: string; answer: string }>
  >([]);

  useClearTerminalOnMount();

  const askQuestion = async (
    agent: AgentConfiguration,
    questionText: string
  ) => {
    setIsProcessingQuestion(true);
    setAnswer(null);

    const dustClient = await getDustClient();
    if (!dustClient) {
      setError("Authentication required. Run `dust login` first.");
      setIsProcessingQuestion(false);
      return;
    }

    let userMessageId: string;
    let conversation: any;

    // Either create a new conversation or add to an existing one
    if (!conversationId) {
      // Create a new conversation with the agent
      const convRes = await dustClient.createConversation({
        title: `CLI Question: ${questionText.substring(0, 30)}${
          questionText.length > 30 ? "..." : ""
        }`,
        visibility: "unlisted",
        message: {
          content: questionText,
          mentions: [{ configurationId: agent.sId }],
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            username: "cli-user",
            fullName: "CLI User",
            email: null,
            origin: "api",
          },
        },
        contentFragment: undefined,
      });

      if (convRes.isErr()) {
        setError(`Failed to create conversation: ${convRes.error.message}`);
        setIsProcessingQuestion(false);
        return;
      }

      // Store the conversation ID for future messages
      conversation = convRes.value.conversation;
      setConversationId(conversation.sId);
      userMessageId = convRes.value.message.sId;
    } else {
      // Add a message to the existing conversation using the client library
      try {
        const workspaceId = await AuthService.getSelectedWorkspaceId();
        if (!workspaceId) {
          throw new Error("No workspace selected");
        }

        // Create a message in the existing conversation
        const messageRes = await dustClient.postUserMessage({
          conversationId: conversationId,
          message: {
            content: questionText,
            mentions: [{ configurationId: agent.sId }],
            context: {
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              username: "cli-user",
              fullName: "CLI User",
              email: null,
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
      } catch (error) {
        setError(`Failed to create message: ${error}`);
        setIsProcessingQuestion(false);
        return;
      }
    }

    try {
      // Stream the agent's response
      const streamRes = await dustClient.streamAgentAnswerEvents({
        conversation: conversation,
        userMessageId: userMessageId,
      });

      if (streamRes.isErr()) {
        setError(`Failed to stream agent answer: ${streamRes.error.message}`);
        setIsProcessingQuestion(false);
        return;
      }

      let responseText = "";
      for await (const event of streamRes.value.eventStream) {
        if (event.type === "generation_tokens") {
          responseText += event.text;
        } else if (event.type === "agent_error") {
          setError(`Agent error: ${event.error.message}`);
          break;
        } else if (event.type === "user_message_error") {
          setError(`User message error: ${event.error.message}`);
          break;
        } else if (event.type === "agent_message_success") {
          // Complete
          setIsComplete(true);
          setAnswer(responseText);

          // Add to conversation history (only if this is a new message)
          setConversationHistory((prev) => {
            // Check if this exact question-answer pair already exists
            const exists = prev.some(
              (item) =>
                item.question === questionText && item.answer === responseText
            );

            if (!exists) {
              return [
                ...prev,
                { question: questionText, answer: responseText },
              ];
            }
            return prev;
          });

          break;
        }
      }
    } catch (error) {
      setError(`Error processing response: ${error}`);
    } finally {
      setIsProcessingQuestion(false);
    }
  };

  useEffect(() => {
    if (isAskingQuestion && !initialQuestion) {
      // Set up readline interface for question input
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      process.stdout.write("\x1bc"); // Clear screen

      // Use ANSI color codes to make the prompt text blue
      const promptText = conversationId
        ? `\x1b[34mWhat would you like to ask ${selectedAgent?.name} next? (continuing conversation) \x1b[0m\n`
        : `\x1b[34mWhat would you like to ask ${selectedAgent?.name}? \x1b[0m\n`;

      rl.question(promptText, (input) => {
        if (input.trim()) {
          setQuestion(input);
          rl.close();
          if (selectedAgent) {
            askQuestion(selectedAgent, input);
          }
        } else {
          rl.close();
          process.exit(0);
        }
      });

      return () => {
        rl.close();
      };
    }
  }, [isAskingQuestion, selectedAgent, initialQuestion, askQuestion]);

  // Handle Ctrl+C key press to quit
  useInput((input, key) => {
    if (key.ctrl && input === "c" && !isAskingQuestion) {
      process.exit(0);
    }
  });

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!selectedAgent) {
    return (
      <AgentSelector
        requestedSIds={requestedSId ? [requestedSId] : []}
        onError={setError}
        onConfirm={(agents) => {
          setSelectedAgent(agents[0]);
          setIsAskingQuestion(true);
        }}
      />
    );
  }

  if (isProcessingQuestion) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="blue">
            Agent:{" "}
          </Text>
          <Text>{selectedAgent?.name}</Text>
        </Box>
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="blue">
            Question:
          </Text>
          <Box marginY={1}></Box>
          <Text>{question}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="green">
            <Spinner type="dots" /> Getting answer...
          </Text>
        </Box>
        {answer && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Response:</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>{answer}</Text>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  if (answer !== null) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Agent: </Text>
          <Text>{selectedAgent?.name}</Text>
        </Box>

        {/* Show conversation history if available */}
        {conversationHistory.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Conversation History:</Text>
            {conversationHistory.map((item, index) => (
              <Box
                key={index}
                flexDirection="column"
                marginLeft={1}
                marginBottom={1}
              >
                <Box>
                  <Text bold color="green">
                    You:{" "}
                  </Text>
                  <Text dimColor>
                    {item.question.length > 60
                      ? `${item.question.substring(0, 60)}...`
                      : item.question}
                  </Text>
                </Box>
                <Box marginLeft={1}>
                  <Text bold color="blue">
                    {selectedAgent?.name}:{" "}
                  </Text>
                  <Text dimColor>
                    {item.answer.length > 60
                      ? `${item.answer.substring(0, 60)}...`
                      : item.answer}
                  </Text>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        <Box marginBottom={1}>
          <Text bold color="blue">
            Question:{" "}
          </Text>
          <Text>{question}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="blue">
            Response:
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text>{answer}</Text>
          </Box>
        </Box>
        <Box marginTop={2} flexDirection="column">
          <Text bold color="blue">
            Type and Enter to ask a follow-up question. {"\n"}
          </Text>
          <Text dimColor>Press Ctrl+C to exit. {"\n"}</Text>
        </Box>
      </Box>
    );
  }
};

export default AskAgent;
