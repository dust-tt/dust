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
 *   /list_models       - List all available models
 *   /select_model <id> - Select a model to use
 *   /conversation      - Show conversation as JSON
 *   /mode <mode>       - Set display mode (default|verbose)
 *   /stream_mode <mode> - Set stream mode (default|model)
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
import { MistralLLM } from "@app/lib/llm/providers/mistral";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  ModelProviderIdType,
} from "@app/types";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";

// Set credentials from environment variables
function setCliCredentials(creds: Record<string, string>): void {
  const credentials = dustManagedCredentials();
  Object.assign(credentials, creds);
}

// Initialize credentials from environment
function initializeCredentials(): void {
  const creds: Record<string, string> = {};
  
  if (process.env.MISTRAL_API_KEY) {
    creds.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    creds.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    creds.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
    creds.GOOGLE_AI_STUDIO_API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY;
  }
  
  setCliCredentials(creds);
}

// Providers that have LLM implementations
const IMPLEMENTED_PROVIDERS = ["mistral"] as const;
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

function getModelConfig(
  modelId: string
): ModelConfigurationType | undefined {
  return getAvailableModels().find((m) => m.modelId === modelId);
}

function setProviderApiKey(
  providerId: ModelProviderIdType,
  apiKey: string
): void {
  switch (providerId) {
    case "mistral":
      setCliCredentials({ MISTRAL_API_KEY: apiKey });
      break;
    case "openai":
      setCliCredentials({ OPENAI_API_KEY: apiKey });
      break;
    case "anthropic":
      setCliCredentials({ ANTHROPIC_API_KEY: apiKey });
      break;
    case "google_ai_studio":
      setCliCredentials({ GOOGLE_AI_STUDIO_API_KEY: apiKey });
      break;
  }
}

function createLLM({
  model,
  apiKey,
  temperature = 0.7,
}: {
  model: ModelConfigurationType;
  apiKey: string;
  temperature?: number;
}): LLM {
  const providerId = model.providerId as ImplementedProviderId;

  // Set the API key for the provider
  setProviderApiKey(providerId, apiKey);

  switch (providerId) {
    case "mistral":
      return new MistralLLM({
        temperature,
        model,
      });
    default:
      throw new Error(`Provider ${providerId} not implemented`);
  }
}

// State
let selectedModel: ModelConfigurationType | null = null;
let conversation: ModelConversationTypeMultiActions = { messages: [] };
let displayMode: "default" | "verbose" = "default";
let streamMode: "default" | "model" = "default";
const outputLines: string[] = [];

// Command handlers
function showHelp() {
  const lines = [
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
  
  lines.push("", "Use: /select_model <modelId>", "========================", "");
  
  outputLines.push(...lines);
  lines.forEach((line) => console.log(line));
}

function selectModel(modelId: string) {
  const model = getModelConfig(modelId);
  
  if (!model) {
    const msg = `Model '${modelId}' not found. Use /list_models to see available models.`;
    outputLines.push(msg, "");
    console.log(msg);
  } else {
    selectedModel = model;
    conversation = { messages: [] }; // Reset conversation
    const msg = `Selected model: ${model.displayName} (${model.modelId})`;
    outputLines.push(msg, "");
    console.log(msg);
  }
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
  if (mode === "verbose" || mode === "default") {
    displayMode = mode as "default" | "verbose";
    const msg = `Display mode set to: ${mode}`;
    outputLines.push(msg, "");
    console.log(msg);
  } else {
    const msg = `Invalid mode. Use 'verbose' or 'default'`;
    outputLines.push(msg, "");
    console.log(msg);
  }
}

function setStreamModeCommand(mode: string) {
  if (mode === "default" || mode === "model") {
    streamMode = mode as "default" | "model";
    const msg = `Stream mode set to: ${mode}`;
    outputLines.push(msg, "");
    console.log(msg);
  } else {
    const msg = `Invalid stream_mode. Use 'default' or 'model'`;
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
    console.error("\nNo model selected. Use /list_models and /select_model <modelId>\n");
    return;
  }

  try {
    // Check for API key
    const credentials = dustManagedCredentials();
    let apiKey: string | undefined;
    
    switch (selectedModel.providerId) {
      case "mistral":
        apiKey = credentials.MISTRAL_API_KEY;
        break;
      case "openai":
        apiKey = credentials.OPENAI_API_KEY;
        break;
      case "anthropic":
        apiKey = credentials.ANTHROPIC_API_KEY;
        break;
      case "google_ai_studio":
        apiKey = credentials.GOOGLE_AI_STUDIO_API_KEY;
        break;
    }

    if (!apiKey) {
      const errorMsg = `No API key provided. Set ${selectedModel.providerId.toUpperCase()}_API_KEY environment variable.`;
      console.error(`\n${errorMsg}\n`);
      outputLines.push(`Error: ${errorMsg}`, "");
      return;
    }

    // Add user message to conversation
    const userMessage = {
      role: "user" as const,
      content: message,
    };

    conversation.messages.push(userMessage);
    outputLines.push(`> ${message}`, "", "Assistant:");

    console.log(`\n> ${message}\n`);
    console.log("Assistant: ");

    // Create LLM instance
    const llm = createLLM({
      model: selectedModel,
      apiKey,
    });

    let fullText = "";

    if (streamMode === "default") {
      // Use the stream() method
      const events = llm.stream({
        conversation,
        prompt: "You are a helpful assistant.",
      });

      for await (const event of events) {
        if (displayMode === "verbose") {
          // In verbose mode, show full event objects as JSON
          const eventStr = JSON.stringify(event, null, 2);
          outputLines.push(eventStr);
          console.log(eventStr);
        } else {
          // In default mode, parse events and display text
          if (event.type === "text_delta") {
            fullText += event.content.delta;
            process.stdout.write(event.content.delta);
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
    } else {
      // Use modelStream() method - always show as JSON
      const modelEvents = (llm as any).modelStream({
        conversation,
        prompt: "You are a helpful assistant.",
      });

      for await (const event of modelEvents) {
        // Always stringify model events
        const eventStr = JSON.stringify(event, null, 2);
        outputLines.push(eventStr);
        console.log(eventStr);
      }
    }

    // Add assistant response to conversation
    if (streamMode === "default" && fullText) {
      const assistantMessage = {
        role: "assistant" as const,
        content: fullText,
      };
      conversation.messages.push(assistantMessage);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    outputLines.push(`Error: ${errorMessage}`, "");
    console.error(`\nError: ${errorMessage}\n`);
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

  if (trimmed === "/list_models") {
    listModels();
    return true;
  }

  if (trimmed.startsWith("/select_model ")) {
    const modelId = trimmed.substring(14).trim();
    selectModel(modelId);
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

  if (trimmed.startsWith("/stream_mode ")) {
    const mode = trimmed.substring(13).trim();
    setStreamModeCommand(mode);
    return true;
  }

  return false;
}

// Main loop
async function main() {
  console.log("\n=== Test LLM Chat Interface ===\n");

  // Initialize credentials
  initializeCredentials();

  const credentials = dustManagedCredentials();
  const hasAnyKey = !!(
    credentials.MISTRAL_API_KEY ||
    credentials.OPENAI_API_KEY ||
    credentials.ANTHROPIC_API_KEY ||
    credentials.GOOGLE_AI_STUDIO_API_KEY
  );

  if (!hasAnyKey) {
    console.error("⚠️  Warning: No API keys found in environment variables.\n");
    console.error("Set at least one of the following:");
    console.error("  export MISTRAL_API_KEY='your-api-key'");
    console.error("  export OPENAI_API_KEY='your-api-key'");
    console.error("  export ANTHROPIC_API_KEY='your-api-key'");
    console.error("  export GOOGLE_AI_STUDIO_API_KEY='your-api-key'\n");
  }

  console.log(`Model: ${selectedModel ? `${selectedModel.displayName} (${selectedModel.modelId})` : "None"}`);
  console.log(`Display Mode: ${displayMode} | Stream Mode: ${streamMode}`);
  console.log("\nType /help for commands, /list_models to see available models\n");

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

