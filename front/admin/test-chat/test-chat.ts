#!/usr/bin/env ts-node
/**
 * Standalone LLM Chat Tester
 *
 * A simple command-line tool to test LLM providers using the actual LLM abstraction layer.
 * This script uses the same LLM implementations as the rest of the codebase.
 *
 * Usage:
 *   ts-node test-chat.ts
 *
 * Commands:
 *   /help              - Show help message
 *   /list-models       - List all available models
 *   /select-model      - Interactively select a model (fuzzy search)
 *   /conversation      - Show conversation as JSON
 *   /mode <mode>       - Set output mode (text|event|model-event)
 *   /save              - Save output to a log file
 *   /exit              - Exit the chat
 *
 * Environment Variables:
 *   MISTRAL_API_KEY    - Your Mistral API key (required for Mistral models)
 *   OPENAI_API_KEY     - Your OpenAI API key (required for OpenAI models)
 *   ANTHROPIC_API_KEY  - Your Anthropic API key (required for Anthropic models)
 */

import * as fs from "fs";
import * as readline from "readline";

import type { LLM } from "@app/lib/llm/llm";
import { NoopLLM } from "@app/lib/llm/providers/noop";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  UserMessageTypeModel,
} from "@app/types";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";

// Providers that have LLM implementations
const IMPLEMENTED_PROVIDERS = ["noop"] as const;
type ImplementedProviderId = (typeof IMPLEMENTED_PROVIDERS)[number];

function isProviderImplemented(
  providerId: string
): providerId is ImplementedProviderId {
  return IMPLEMENTED_PROVIDERS.includes(providerId as ImplementedProviderId);
}

function getAvailableModels(): ModelConfigurationType[] {
  return SUPPORTED_MODEL_CONFIGS.filter((model) =>
    isProviderImplemented(model.providerId)
  );
}

function getModelsByProvider(): Record<
  ImplementedProviderId,
  ModelConfigurationType[]
> {
  const modelsByProvider: Record<string, ModelConfigurationType[]> = {};

  for (const model of getAvailableModels()) {
    if (!modelsByProvider[model.providerId]) {
      modelsByProvider[model.providerId] = [];
    }
    modelsByProvider[model.providerId].push(model);
  }

  return modelsByProvider as Record<
    ImplementedProviderId,
    ModelConfigurationType[]
  >;
}

function createLLM({
  model,
}: {
  model: ModelConfigurationType;
}): LLM {
  const providerId = model.providerId as ImplementedProviderId;

  switch (providerId) {
    case "noop":
      return new NoopLLM({
        model,
      });
    default:
      throw new Error(`Provider ${providerId} not implemented`);
  }
}

// ANSI color codes
const GRAY = "\x1b[90m";
const RESET = "\x1b[0m";
const CLEAR_LINE = "\x1b[2K";
const CURSOR_UP = "\x1b[1A";

// Output modes
type OutputMode = "text" | "event" | "model-event";

// State
let selectedModel: ModelConfigurationType | null = null;
let conversation: ModelConversationTypeMultiActions = { messages: [] };
let outputMode: OutputMode = "text";
const outputLines: string[] = [];

// Interactive model selector
async function interactiveModelSelector(): Promise<void> {
  const models = getAvailableModels();
  let searchQuery = "";
  let cursor = 0;

  const filterModels = (query: string) => {
    return models.filter(
      (model) =>
        model.modelId.toLowerCase().includes(query.toLowerCase()) ||
        model.displayName.toLowerCase().includes(query.toLowerCase())
    );
  };

  const redraw = () => {
    const filtered = filterModels(searchQuery);
    const maxVisible = 10;

    // Clear screen
    process.stdout.write(CLEAR_LINE + "\r");
    process.stdout.write(`Search: ${searchQuery}\n`);
    process.stdout.write("─".repeat(process.stdout.columns || 80) + "\n");

    // Show filtered models
    const startIdx = Math.max(0, cursor - maxVisible + 1);
    const endIdx = Math.min(filtered.length, startIdx + maxVisible);

    for (let i = startIdx; i < endIdx; i++) {
      const model = filtered[i];
      const marker = i === cursor ? "> " : "  ";
      const selected = selectedModel?.modelId === model.modelId ? "* " : "";
      process.stdout.write(
        `${marker}${selected}${model.displayName} (${model.modelId})\n`
      );
    }

    process.stdout.write("─".repeat(process.stdout.columns || 80) + "\n");
    process.stdout.write(
      "↑/↓: Navigate | Enter: Select | Esc: Cancel | Type to filter\n"
    );
  };

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    redraw();

    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup();
        console.log("\nSelection cancelled\n");
        resolve();
        return;
      }

      const filtered = filterModels(searchQuery);

      if (key.name === "return") {
        if (filtered[cursor]) {
          selectedModel = filtered[cursor];
          conversation = { messages: [] };
          cleanup();
          console.log(
            `\nSelected: ${selectedModel.displayName} (${selectedModel.modelId})\n`
          );
          resolve();
        }
        return;
      }

      if (key.name === "up") {
        cursor = cursor > 0 ? cursor - 1 : filtered.length - 1;
      } else if (key.name === "down") {
        cursor = cursor < filtered.length - 1 ? cursor + 1 : 0;
      } else if (key.name === "backspace") {
        searchQuery = searchQuery.slice(0, -1);
        cursor = 0;
      } else if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.meta
      ) {
        searchQuery += key.sequence;
        cursor = 0;
      }

      // Clear previous output
      const linesToClear = Math.min(10, filterModels(searchQuery).length) + 4;
      for (let i = 0; i < linesToClear; i++) {
        process.stdout.write(CURSOR_UP + CLEAR_LINE);
      }

      redraw();
    };

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    process.stdin.on("keypress", onKeypress);
  });
}

// Command handlers
function showHelp() {
  const lines = [
    "",
    "=== Available Commands ===",
    "/help              - Show this help message",
    "/list-models       - List all available models",
    "/select-model      - Interactively select a model (fuzzy search)",
    "/conversation      - Show conversation as JSON",
    "/mode <mode>       - Set output mode:",
    "                     text (default): Clean text output with thinking in gray",
    "                     event: Show normalized LLM events as JSON",
    "                     model-event: Show raw provider events as JSON",
    "/save              - Save all output to a log file",
    "/exit              - Exit test-chat mode",
    "==========================",
    "",
  ];

  outputLines.push(...lines);
  lines.forEach((line) => console.log(line));
}

function listModels() {
  const modelsByProvider = getModelsByProvider();
  const lines: string[] = ["", "=== Available Models ==="];

  for (const [providerId, models] of Object.entries(modelsByProvider)) {
    lines.push(``, `Provider: ${providerId}`);
    for (const model of models) {
      const marker = selectedModel?.modelId === model.modelId ? "* " : "  ";
      lines.push(`${marker}${model.modelId} - ${model.displayName}`);
    }
  }

  lines.push(
    "",
    "Use: /select-model to interactively select",
    "========================",
    ""
  );

  outputLines.push(...lines);
  lines.forEach((line) => console.log(line));
}

function showConversation() {
  const lines = [
    "",
    "=== Conversation JSON ===",
    JSON.stringify(conversation, null, 2),
    "========================",
    "",
  ];

  outputLines.push(...lines);
  lines.forEach((line) => console.log(line));
}

function setMode(mode: string) {
  if (mode === "text" || mode === "event" || mode === "model-event") {
    outputMode = mode as OutputMode;
    const descriptions = {
      text: "Clean text output with thinking in gray",
      event: "Normalized LLM events as JSON",
      "model-event": "Raw provider events as JSON",
    };
    const msg = `Output mode set to: ${mode} (${descriptions[mode]})`;
    outputLines.push(msg, "");
    console.log(msg);
  } else {
    const msg = `Invalid mode. Use 'text', 'event', or 'model-event'`;
    outputLines.push(msg, "");
    console.log(msg);
  }
}

function saveLog() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `test-llm-chat-log-${timestamp}.txt`;
  const content = [
    "=== Test LLM Chat Log ===",
    `Date: ${new Date().toISOString()}`,
    `Model: ${selectedModel ? `${selectedModel.displayName} (${selectedModel.modelId})` : "None"}`,
    `Output Mode: ${outputMode}`,
    "",
    "=== Output ===",
    ...outputLines,
    "",
    "=== Conversation JSON ===",
    JSON.stringify(conversation, null, 2),
  ].join("\n");

  try {
    fs.writeFileSync(filename, content, "utf-8");
    const msg = `✓ Saved to ${filename}`;
    outputLines.push(msg, "");
    console.log(`\n${msg}\n`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const msg = `✗ Failed to save: ${errorMsg}`;
    outputLines.push(msg, "");
    console.error(`\n${msg}\n`);
  }
}

// Stream message to LLM
async function streamMessage(message: string) {
  if (!selectedModel) {
    console.error("\nNo model selected. Use /select-model to choose a model\n");
    return;
  }
  // Add user message to conversation
  const userMessage: UserMessageTypeModel = {
    role: "user" as const,
    content: [{ type: "text", text: message }],
    name: "user",
  };

  conversation.messages.push(userMessage);
  outputLines.push(`> ${message}`, "", "Assistant:");

  console.log("Assistant: ");

  // Create LLM instance
  const llm = createLLM({
    model: selectedModel,
  });

  let fullText = "";
  let _fullThinking = "";

  if (outputMode === "model-event") {
    // Use modelStream() method - show raw provider events as JSON
    const modelEvents = (llm as any).modelStream({
      conversation,
      prompt: "You are a helpful assistant.",
    });

    for await (const event of modelEvents) {
      const eventStr = JSON.stringify(event, null, 2);
      outputLines.push(eventStr);
      console.log(eventStr);
    }
  } else {
    // Use the stream() method for normalized events
    const events = llm.stream({
      conversation,
      prompt: "You are a helpful assistant.",
    });

    for await (const event of events) {
      if (outputMode === "event") {
        // Show normalized events as JSON
        const eventStr = JSON.stringify(event, null, 2);
        outputLines.push(eventStr);
        console.log(eventStr);
      } else {
        // Text mode: show clean text with thinking in gray
        if (event.type === "reasoning_delta") {
          _fullThinking += event.content.delta;
          console.log(GRAY + event.content.delta + RESET);
        } else if (event.type === "text_delta") {
          fullText += event.content.delta;
          console.log(event.content.delta);
        } else if (event.type === "success") {
          // Stream complete
          outputLines.push(fullText, "");
          console.log("\n");
        } else if (event.type === "error") {
          const errorMsg = `Error: ${event.content.message}`;
          outputLines.push(errorMsg, "");
          console.error(`\n${errorMsg}\n`);
          return;
        }
      }
    }

    // Add assistant response to conversation (only in text/event mode)
    if (fullText) {
      const assistantMessage = {
        role: "assistant" as const,
        name: "assistant",
        content: fullText,
      };
      conversation.messages.push(assistantMessage);
    }
  }
}

// Handle command
async function handleCommand(input: string): Promise<boolean> {
  const trimmed = input.trim();

  if (trimmed === "/help") {
    showHelp();
    return true;
  }

  if (trimmed === "/exit") {
    console.log("\nGoodbye!\n");
    process.exit(0);
  }

  if (trimmed === "/save") {
    saveLog();
    return true;
  }

  if (trimmed === "/list-models") {
    listModels();
    return true;
  }

  if (trimmed === "/select-model") {
    await interactiveModelSelector();
    return true;
  }

  if (trimmed === "/conversation") {
    showConversation();
    return true;
  }

  if (trimmed.startsWith("/mode ")) {
    const mode = trimmed.substring(6).trim();
    setMode(mode);
    return true;
  }

  return false;
}

// Main loop
async function main() {
  console.log("\n=== Test LLM Chat Interface ===\n");

  console.log(
    `Model: ${selectedModel ? `${selectedModel.displayName} (${selectedModel.modelId})` : "None"}`
  );
  console.log(`Output Mode: ${outputMode}`);
  console.log("\nType /help for commands, /select-model to choose a model\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Check if it's a command
    if (input.startsWith("/")) {
      const handled = await handleCommand(input);
      if (!handled) {
        console.log("Unknown command. Type /help for available commands.");
      }
      rl.prompt();
      return;
    }

    // Stream the message to the LLM
    await streamMessage(input);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye!\n");
    process.exit(0);
  });
}

// Run
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
