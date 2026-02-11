import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Box, Text, Static } from "ink";
import Spinner from "ink-spinner";

import type { DustAPI } from "@dust-tt/client";
import { createAgentLoop } from "../agent/loop.js";
import type { AgentEvent, ToolCall } from "../agent/types.js";
import { buildSystemPrompt } from "../agent/systemPrompt.js";
import {
  createTools,
  getToolDefinitions,
  executeTool,
} from "../tools/index.js";
import type { ToolContext } from "../tools/index.js";
import { InputBox } from "./InputBox.js";
import { ToolApprovalSelector } from "./ToolApprovalSelector.js";
import { ToolExecution } from "./ToolExecution.js";
import type { ToolCallDisplay } from "./ToolExecution.js";
import { WelcomeHeader } from "./WelcomeHeader.js";
import { createCommands } from "./commands/types.js";
import type { Command } from "./commands/types.js";

// --- Types for ordered display ---

type LiveItem =
  | { type: "thinking"; id: string; text: string }
  | { type: "text"; id: string; text: string }
  | { type: "tool_call"; id: string; call: ToolCallDisplay };

type HistoryItem =
  | { type: "welcome"; id: string }
  | { type: "user"; id: string; content: string }
  | { type: "thinking"; id: string; content: string }
  | { type: "text"; id: string; content: string }
  | { type: "tool_call"; id: string; call: ToolCallDisplay }
  | { type: "info"; id: string; content: string }
  | { type: "error"; id: string; content: string }
  | { type: "separator"; id: string };

interface ChatProps {
  dustClient: DustAPI;
  cwd: string;
  initialPrompt?: string;
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

const SEPARATOR = "─".repeat(50);

export function Chat({ dustClient, cwd, initialPrompt }: ChatProps) {
  const [history, setHistory] = useState<HistoryItem[]>([
    { type: "welcome", id: "welcome" },
  ]);
  const [liveItems, setLiveItems] = useState<LiveItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0 });

  // Pending user question resolver for ask_user tool.
  const askUserResolverRef = useRef<((answer: string) => void) | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  // Pending tool approval resolver.
  const approvalResolverRef = useRef<((approved: boolean) => void) | null>(
    null
  );
  const [pendingApproval, setPendingApproval] = useState<ToolCall | null>(null);

  const loopRef = useRef<ReturnType<typeof createAgentLoop> | null>(null);
  const idCounter = useRef(0);

  const nextId = useCallback(() => {
    idCounter.current += 1;
    return `item-${idCounter.current}`;
  }, []);

  // Initialize agent loop.
  useEffect(() => {
    const approveToolCall = (call: ToolCall): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setPendingApproval(call);
        approvalResolverRef.current = resolve;
      });
    };

    const toolContext: ToolContext = {
      cwd,
      dustClient,
      askUser: async (question: string) => {
        return new Promise<string>((resolve) => {
          setPendingQuestion(question);
          askUserResolverRef.current = resolve;
        });
      },
      approveToolCall,
    };

    const tools = createTools(toolContext);
    const toolDefs = getToolDefinitions(tools);
    const systemPrompt = buildSystemPrompt(cwd);

    const loop = createAgentLoop({
      dustClient,
      systemPrompt,
      tools: toolDefs,
      executeTool: (call) => executeTool(tools, call, approveToolCall),
    });

    loopRef.current = loop;

    // Consume events in background.
    (async () => {
      for await (const event of loop.events()) {
        handleEvent(event);
      }
    })();

    // Send initial prompt if provided.
    if (initialPrompt) {
      setIsProcessing(true);
      setHistory((prev) => [
        ...prev,
        { id: nextId(), type: "user", content: initialPrompt },
        { id: nextId(), type: "separator" },
      ]);
      loop.sendMessage(initialPrompt);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "thinking_delta":
          setLiveItems((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.type === "thinking") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + event.text },
              ];
            }
            return [
              ...prev,
              { type: "thinking", id: `live-${Date.now()}`, text: event.text },
            ];
          });
          break;

        case "text_delta":
          setLiveItems((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.type === "text") {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + event.text },
              ];
            }
            return [
              ...prev,
              { type: "text", id: `live-${Date.now()}`, text: event.text },
            ];
          });
          break;

        case "tool_use":
          setLiveItems((prev) => [
            ...prev,
            {
              type: "tool_call",
              id: `live-tc-${event.id}`,
              call: {
                id: event.id,
                name: event.name,
                input: event.input,
                status: "executing",
                startTime: Date.now(),
              },
            },
          ]);
          break;

        case "tool_executing":
          setLiveItems((prev) =>
            prev.map((item) =>
              item.type === "tool_call" && item.call.id === event.id
                ? {
                    ...item,
                    call: { ...item.call, status: "executing" as const },
                  }
                : item
            )
          );
          break;

        case "tool_result":
          setLiveItems((prev) =>
            prev.map((item) =>
              item.type === "tool_call" && item.call.id === event.id
                ? {
                    ...item,
                    call: {
                      ...item.call,
                      status: "done" as const,
                      result: event.result,
                      duration: item.call.startTime
                        ? (Date.now() - item.call.startTime) / 1000
                        : undefined,
                    },
                  }
                : item
            )
          );
          break;

        case "usage":
          setTotalTokens((prev) => ({
            input: prev.input + event.inputTokens,
            output: prev.output + event.outputTokens,
          }));
          break;

        case "done":
          // Flush live items into history.
          setLiveItems((prev) => {
            if (prev.length > 0) {
              const historyItems: HistoryItem[] = prev.map((item) => {
                switch (item.type) {
                  case "thinking":
                    return {
                      type: "thinking" as const,
                      id: item.id,
                      content: item.text,
                    };
                  case "text":
                    return {
                      type: "text" as const,
                      id: item.id,
                      content: item.text,
                    };
                  case "tool_call":
                    return {
                      type: "tool_call" as const,
                      id: item.id,
                      call: item.call,
                    };
                }
              });
              setHistory((h) => [
                ...h,
                ...historyItems,
                { type: "separator", id: `sep-${Date.now()}` },
              ]);
            }
            return [];
          });
          setIsProcessing(false);
          break;

        case "error":
          setLiveItems([]);
          setHistory((prev) => [
            ...prev,
            { type: "error", id: `err-${Date.now()}`, content: event.message },
            { type: "separator", id: `sep-${Date.now()}` },
          ]);
          setIsProcessing(false);
          break;
      }
    },
    [nextId]
  );

  const commands = useMemo(
    () =>
      createCommands({
        showHelp: () => {
          setHistory((prev) => [
            ...prev,
            {
              id: nextId(),
              type: "info",
              content: [
                "Available commands:",
                "  /help    — Show this help message",
                "  /clear   — Clear conversation history",
                "  /status  — Show token usage and session info",
                "  /exit    — Exit the CLI",
                "",
                "Keyboard shortcuts:",
                "  Enter       — Send message",
                "  \\Enter     — Insert newline",
                "  Ctrl+U      — Clear input",
                "  Ctrl+A/E    — Jump to line start/end",
                "  Opt+←/→     — Jump by word",
                "  ↑/↓         — Move between lines",
                "  /           — Open command selector",
                "  Ctrl+C      — Exit",
              ].join("\n"),
            },
            { id: nextId(), type: "separator" },
          ]);
        },
        clearConversation: () => {
          setHistory([{ type: "welcome", id: "welcome" }]);
          setLiveItems([]);
        },
        showStatus: () => {
          setHistory((prev) => [
            ...prev,
            {
              id: nextId(),
              type: "info",
              content: [
                `Directory: ${cwd}`,
                `Tokens: ${formatTokenCount(totalTokens.input)} in / ${formatTokenCount(totalTokens.output)} out`,
                `Messages: ${history.filter((h) => h.type === "user").length} sent`,
                `Processing: ${isProcessing ? "yes" : "no"}`,
              ].join("\n"),
            },
            { id: nextId(), type: "separator" },
          ]);
        },
      }),
    [nextId, cwd, totalTokens, history, isProcessing]
  );

  const handleCommandSelect = useCallback((command: Command) => {
    void command.execute({});
  }, []);

  const handleSubmit = useCallback(
    (text: string) => {
      // Check if we're answering an ask_user question.
      if (pendingQuestion && askUserResolverRef.current) {
        askUserResolverRef.current(text);
        askUserResolverRef.current = null;
        setPendingQuestion(null);
        return;
      }

      if (!loopRef.current || isProcessing) {
        return;
      }

      setIsProcessing(true);
      setHistory((prev) => [
        ...prev,
        { id: nextId(), type: "user", content: text },
        { id: nextId(), type: "separator" },
      ]);
      loopRef.current.sendMessage(text);
    },
    [isProcessing, nextId, pendingQuestion]
  );

  // Check if there's an active tool executing (for spinner).
  const hasActiveToolCall = liveItems.some(
    (item) => item.type === "tool_call" && item.call.status === "executing"
  );

  return (
    <Box flexDirection="column" padding={1}>
      {/* Static history: welcome header + all finalized items */}
      <Static items={history}>
        {(item) => {
          switch (item.type) {
            case "welcome":
              return (
                <Box key={item.id}>
                  <WelcomeHeader cwd={cwd} />
                </Box>
              );
            case "user":
              return (
                <Box key={item.id} flexDirection="column">
                  <Text color="green" bold>
                    You
                  </Text>
                  <Text>{item.content}</Text>
                </Box>
              );
            case "thinking":
              return (
                <Box key={item.id}>
                  <Text color="gray" dimColor italic>
                    {item.content}
                  </Text>
                </Box>
              );
            case "text":
              return (
                <Box key={item.id}>
                  <Text>{item.content}</Text>
                </Box>
              );
            case "tool_call":
              return (
                <Box key={item.id}>
                  <ToolExecution toolCalls={[item.call]} />
                </Box>
              );
            case "info":
              return (
                <Box key={item.id}>
                  <Text dimColor>{item.content}</Text>
                </Box>
              );
            case "error":
              return (
                <Box key={item.id}>
                  <Text color="red" bold>
                    {"✗ Error: "}
                    <Text color="red">{item.content}</Text>
                  </Text>
                </Box>
              );
            case "separator":
              return (
                <Box key={item.id}>
                  <Text dimColor>{SEPARATOR}</Text>
                </Box>
              );
          }
        }}
      </Static>

      {/* Live streaming area: items in arrival order */}
      {liveItems.map((item) => {
        switch (item.type) {
          case "thinking":
            return (
              <Box key={item.id}>
                <Text color="gray" dimColor italic>
                  {item.text}
                </Text>
              </Box>
            );
          case "text":
            return (
              <Box key={item.id}>
                <Text>{item.text}</Text>
              </Box>
            );
          case "tool_call":
            return (
              <Box key={item.id}>
                <ToolExecution toolCalls={[item.call]} />
              </Box>
            );
        }
      })}

      {/* Spinner when processing but nothing streaming yet */}
      {isProcessing && liveItems.length === 0 && (
        <Box>
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> Thinking...</Text>
        </Box>
      )}

      {/* Spinner when waiting for a tool to complete */}
      {isProcessing && hasActiveToolCall && (
        <Box>
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> Running...</Text>
        </Box>
      )}

      {/* Pending tool approval */}
      {pendingApproval && (
        <ToolApprovalSelector
          call={pendingApproval}
          onApproval={(approved) => {
            if (approvalResolverRef.current) {
              approvalResolverRef.current(approved);
              approvalResolverRef.current = null;
            }
            setPendingApproval(null);
          }}
        />
      )}

      {/* Pending question from ask_user */}
      {pendingQuestion && (
        <Box paddingX={1} flexDirection="column" marginTop={1}>
          <Box width={15}>
            <Text color="blue" bold>
              Agent asks
            </Text>
          </Box>
          <Text>{pendingQuestion}</Text>
        </Box>
      )}

      {/* Input */}
      <InputBox
        onSubmit={handleSubmit}
        onCommandSelect={handleCommandSelect}
        commands={commands}
        disabled={(isProcessing && !pendingQuestion) || !!pendingApproval}
        placeholder={
          pendingQuestion
            ? "Answer the agent's question..."
            : "Type a message..."
        }
      />

      {/* Token usage — compact one-liner */}
      {(totalTokens.input > 0 || totalTokens.output > 0) && (
        <Box marginTop={1}>
          <Text dimColor>
            tokens: {formatTokenCount(totalTokens.input)} in /{" "}
            {formatTokenCount(totalTokens.output)} out
          </Text>
        </Box>
      )}
    </Box>
  );
}
