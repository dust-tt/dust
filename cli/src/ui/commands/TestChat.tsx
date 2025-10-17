import fs from "node:fs";

import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import React, { useCallback, useState } from "react";

import type {
  ConversationTypeMultiActions,
  ModelConfigurationType,
} from "@app/types";

import { createLLM, setProviderApiKey } from "../../utils/llmFactory.js";
import {
  getModelConfig,
  getModelsByProvider,
} from "../../utils/modelRegistry.js";

type DisplayMode = "default" | "verbose";
type StreamMode = "default" | "model";

interface TestChatProps {
  apiKey?: string;
}

const TestChat: FC<TestChatProps> = ({ apiKey }) => {
  const [selectedModel, setSelectedModel] = useState<ModelConfigurationType | null>(null);
  const [conversation, setConversation] = useState<ConversationTypeMultiActions>({
    messages: [],
  });
  const [userInput, setUserInput] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("default");
  const [streamMode, setStreamMode] = useState<StreamMode>("default");
  const [isStreaming, setIsStreaming] = useState(false);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [currentStreamingText, setCurrentStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCommand = useCallback(
    (input: string) => {
      const trimmed = input.trim();

      if (trimmed === "/help") {
        setOutputLines((prev) => [
          ...prev,
          "",
          "=== Available Commands ===",
          "/help              - Show this help message",
          "/list_models       - List all available models",
          "/select_model <id> - Select a model to use",
          "/conversation      - Show conversation as JSON",
          "/mode <mode>       - Set display mode (default|verbose)",
          "                     Applies only when stream_mode=default",
          "/stream_mode <mode> - Set stream mode (default|model)",
          "                      default: uses stream() method",
          "                      model: uses modelStream() method",
          "/save              - Save all output to a log file",
          "/exit              - Exit test-chat mode",
          "==========================",
          "",
        ]);
        return true;
      }

      if (trimmed === "/exit") {
        process.exit(0);
      }

      if (trimmed === "/save") {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `test-chat-log-${timestamp}.txt`;
        const content = [
          "=== Test Chat Log ===",
          `Date: ${new Date().toISOString()}`,
          `Model: ${selectedModel ? `${selectedModel.displayName} (${selectedModel.modelId})` : "None"}`,
          `Display Mode: ${displayMode}`,
          `Stream Mode: ${streamMode}`,
          "",
          "=== Output ===",
          ...outputLines,
          "",
          "=== Conversation JSON ===",
          JSON.stringify(conversation, null, 2),
        ].join("\n");

        try {
          fs.writeFileSync(filename, content, "utf-8");
          setOutputLines((prev) => [
            ...prev,
            `✓ Saved to ${filename}`,
            "",
          ]);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(`Failed to save: ${errorMsg}`);
          setOutputLines((prev) => [
            ...prev,
            `✗ Failed to save: ${errorMsg}`,
            "",
          ]);
        }
        return true;
      }

      if (trimmed === "/list_models") {
        const modelsByProvider = getModelsByProvider();
        const lines: string[] = ["", "=== Available Models ==="];
        
        for (const [providerId, models] of Object.entries(modelsByProvider)) {
          lines.push(``, `Provider: ${providerId}`);
          for (const model of models) {
            const marker = selectedModel?.modelId === model.modelId ? "* " : "  ";
            lines.push(`${marker}${model.modelId} - ${model.displayName}`);
          }
        }
        
        lines.push("", "Use: /select_model <modelId>", "========================", "");
        setOutputLines((prev) => [...prev, ...lines]);
        return true;
      }

      if (trimmed.startsWith("/select_model ")) {
        const modelId = trimmed.substring(14).trim();
        const model = getModelConfig(modelId);
        
        if (!model) {
          setOutputLines((prev) => [
            ...prev,
            `Model '${modelId}' not found. Use /list_models to see available models.`,
            "",
          ]);
        } else {
          setSelectedModel(model);
          setConversation({ messages: [] }); // Reset conversation
          setOutputLines((prev) => [
            ...prev,
            `Selected model: ${model.displayName} (${model.modelId})`,
            "",
          ]);
        }
        return true;
      }

      if (trimmed === "/conversation") {
        setOutputLines((prev) => [
          ...prev,
          "",
          "=== Conversation JSON ===",
          JSON.stringify(conversation, null, 2),
          "========================",
          "",
        ]);
        return true;
      }

      if (trimmed.startsWith("/mode ")) {
        const mode = trimmed.substring(6).trim() as DisplayMode;
        if (mode === "verbose" || mode === "default") {
          setDisplayMode(mode);
          setOutputLines((prev) => [
            ...prev,
            `Display mode set to: ${mode}`,
            "",
          ]);
        } else {
          setOutputLines((prev) => [
            ...prev,
            `Invalid mode. Use 'verbose' or 'default'`,
            "",
          ]);
        }
        return true;
      }

      if (trimmed.startsWith("/stream_mode ")) {
        const mode = trimmed.substring(13).trim() as StreamMode;
        if (mode === "default" || mode === "model") {
          setStreamMode(mode);
          setOutputLines((prev) => [
            ...prev,
            `Stream mode set to: ${mode}`,
            "",
          ]);
        } else {
          setOutputLines((prev) => [
            ...prev,
            `Invalid stream_mode. Use 'default' or 'model'`,
            "",
          ]);
        }
        return true;
      }

      return false;
    },
    [conversation, selectedModel]
  );

  const streamMessage = useCallback(
    async (message: string) => {
      if (!selectedModel) {
        setError("No model selected. Use /list_models and /select_model <modelId>");
        return;
      }

      setIsStreaming(true);
      setCurrentStreamingText("");
      setError(null);

      try {
        // Validate API key
        if (!apiKey) {
          throw new Error(
            `No API key provided. Set ${selectedModel.providerId.toUpperCase()}_API_KEY environment variable.`
          );
        }

        // Set the API key for the provider
        setProviderApiKey(selectedModel.providerId as any, apiKey);

        // Add user message to conversation
        const userMessage = {
          role: "user" as const,
          content: message,
        };

        const updatedConversation: ConversationTypeMultiActions = {
          messages: [...conversation.messages, userMessage],
        };

        setConversation(updatedConversation);
        setOutputLines((prev) => [
          ...prev,
          `> ${message}`,
          "",
          "Assistant:",
        ]);

        // Create LLM instance
        const llm = createLLM({
          model: selectedModel,
          apiKey,
        });

        let fullText = "";

        if (streamMode === "default") {
          // Use the stream() method
          const events = llm.stream({
            conversation: updatedConversation,
            prompt: "You are a helpful assistant.",
          });

          for await (const event of events) {
            if (displayMode === "verbose") {
              // In verbose mode, show full event objects as JSON
              const eventStr = JSON.stringify(event, null, 2);
              setOutputLines((prev) => [...prev, eventStr]);
            } else {
              // In default mode, parse events and display text
              if (event.type === "text_delta") {
                fullText += event.content.delta;
                setCurrentStreamingText(fullText);
              } else if (event.type === "reasoning_delta") {
                // Could display reasoning separately if needed
              } else if (event.type === "success") {
                // Stream complete
                setOutputLines((prev) => [...prev, fullText, ""]);
                setCurrentStreamingText("");
              } else if (event.type === "error") {
                setError(event.content.message);
                setOutputLines((prev) => [
                  ...prev,
                  `Error: ${event.content.message}`,
                  "",
                ]);
              }
            }
          }
        } else {
          // Use modelStream() method - always show as JSON
          const modelEvents = llm.modelStream({
            conversation: updatedConversation,
            prompt: "You are a helpful assistant.",
          });

          for await (const event of modelEvents) {
            // Always stringify model events
            const eventStr = JSON.stringify(event, null, 2);
            setOutputLines((prev) => [...prev, eventStr]);
          }
        }

        // Add assistant response to conversation
        const assistantMessage = {
          role: "assistant" as const,
          content: fullText,
        };

        setConversation({
          messages: [...updatedConversation.messages, assistantMessage],
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setOutputLines((prev) => [...prev, `Error: ${errorMessage}`, ""]);
      } finally {
        setIsStreaming(false);
      }
    },
    [conversation, displayMode, streamMode, selectedModel, apiKey]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = userInput.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    // Check if it's a command
    if (trimmed.startsWith("/")) {
      const handled = handleCommand(trimmed);
      if (handled) {
        setUserInput("");
        setCursorPosition(0);
        return;
      }
    }

    // Stream the message
    void streamMessage(trimmed);
    setUserInput("");
    setCursorPosition(0);
  }, [userInput, isStreaming, handleCommand, streamMessage]);

  useInput((input, key) => {
    if (key.return) {
      handleSubmit();
      return;
    }

    if (key.escape) {
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

    // Handle regular character input
    if (!key.ctrl && !key.meta && input && input.length === 1) {
      const newInput =
        userInput.slice(0, cursorPosition) +
        input +
        userInput.slice(cursorPosition);
      setUserInput(newInput);
      setCursorPosition(cursorPosition + 1);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Test Chat Interface
        </Text>
      </Box>
      {!apiKey && (
        <Box marginBottom={1}>
          <Text color="red">
            ⚠️  No API key set. Set MISTRAL_API_KEY environment variable.
          </Text>
        </Box>
      )}
      {!selectedModel && (
        <Box marginBottom={1}>
          <Text color="yellow">
            No model selected. Use /list_models to see available models.
          </Text>
        </Box>
      )}
      <Box marginBottom={1}>
        <Text dimColor>
          Model: {selectedModel ? `${selectedModel.displayName} (${selectedModel.modelId})` : "None"} | 
          Display: {displayMode} | Stream: {streamMode}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          Commands: /help, /list_models, /select_model, /save, /exit (and more)
        </Text>
      </Box>
      <Box
        borderStyle="single"
        borderColor="gray"
        flexDirection="column"
        paddingX={1}
        minHeight={15}
      >
        {outputLines.map((line, idx) => (
          <Text key={idx}>{line}</Text>
        ))}
        {currentStreamingText && <Text>{currentStreamingText}</Text>}
      </Box>
      <Box marginTop={1}>
        {error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}
        <Text>
          {isStreaming ? "Streaming... " : "> "}
          {userInput.slice(0, cursorPosition)}
          <Text inverse>{userInput[cursorPosition] || " "}</Text>
          {userInput.slice(cursorPosition + 1)}
        </Text>
      </Box>
    </Box>
  );
};

export default TestChat;
