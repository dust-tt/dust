import React from "react";
import { Box, Text } from "ink";

interface ToolCallDisplay {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "executing" | "done";
  result?: string;
  startTime?: number;
  duration?: number;
}

interface ToolExecutionProps {
  toolCalls: ToolCallDisplay[];
}

const TOOL_LABELS: Record<string, string> = {
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
  bash: "Bash",
  grep: "Search",
  glob: "Files",
  ask_user: "Ask",
  call_dust_agent: "Agent",
  task: "Task",
};

function getLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

function getPrimaryParam(
  name: string,
  input: Record<string, unknown>
): string {
  if (["read_file", "write_file", "edit_file"].includes(name)) {
    const p = input.path || input.file_path || input.filePath;
    return typeof p === "string" ? shortenFilePath(p) : "";
  }
  if (name === "bash") {
    const cmd = input.command;
    return typeof cmd === "string" ? truncate(cmd, 60) : "";
  }
  if (name === "grep") {
    const pattern = input.pattern || input.query;
    return typeof pattern === "string" ? truncate(pattern, 60) : "";
  }
  if (name === "glob") {
    const pattern = input.pattern || input.glob;
    return typeof pattern === "string" ? truncate(pattern, 60) : "";
  }
  if (name === "call_dust_agent") {
    const agent = input.agent_name || input.agentName;
    return typeof agent === "string" ? agent : "";
  }
  for (const val of Object.values(input)) {
    if (typeof val === "string") {
      return truncate(val, 60);
    }
  }
  return "";
}

function shortenFilePath(p: string): string {
  const parts = p.split("/");
  if (parts.length > 4) {
    return ".../" + parts.slice(-3).join("/");
  }
  return p;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "…";
}

function formatDuration(seconds: number): string {
  if (seconds < 0.1) return "";
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

interface DiffLine {
  content: string;
  type: "remove" | "add";
}

function buildDiffLines(oldStr: string, newStr: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const line of oldStr.split("\n")) {
    lines.push({ content: line, type: "remove" });
  }
  for (const line of newStr.split("\n")) {
    lines.push({ content: line, type: "add" });
  }
  return lines;
}

function formatResult(result: string): string[] {
  const lines = result.split("\n").filter((l) => l.trim());
  return lines.slice(0, 10);
}

export function ToolExecution({ toolCalls }: ToolExecutionProps) {
  return (
    <Box flexDirection="column">
      {toolCalls.map((tc) => {
        const label = getLabel(tc.name);
        const param = getPrimaryParam(tc.name, tc.input);
        const isRejected =
          tc.result === "Tool execution rejected by user.";
        const isError =
          isRejected ||
          (tc.result ? tc.result.toLowerCase().startsWith("error") : false);
        const duration = tc.duration ? formatDuration(tc.duration) : "";

        return (
          <Box key={tc.id} flexDirection="column">
            <Box>
              <Text
                color={
                  tc.status === "executing"
                    ? "yellow"
                    : isError
                      ? "red"
                      : "green"
                }
              >
                {tc.status === "executing" ? "  ⟳ " : isError ? "  ✗ " : "  ✓ "}
              </Text>
              <Text
                bold
                color={
                  tc.status === "executing"
                    ? "yellow"
                    : isError
                      ? "red"
                      : "green"
                }
              >
                {label}
              </Text>
              <Text color="gray">{"  "}{param}</Text>
              {duration && <Text dimColor>{"  "}{duration}</Text>}
            </Box>
            {tc.result && isError && (
              <Box marginLeft={4} flexDirection="column">
                {formatResult(tc.result).map((line, i) => (
                  <Text key={i} color="red" dimColor>
                    {line}
                  </Text>
                ))}
              </Box>
            )}
            {tc.name === "edit_file" &&
              tc.status === "executing" &&
              typeof tc.input.old_string === "string" &&
              typeof tc.input.new_string === "string" && (
                <Box marginLeft={4} flexDirection="column">
                  {buildDiffLines(
                    tc.input.old_string,
                    tc.input.new_string
                  ).map((line, i) => (
                    <Text
                      key={i}
                      backgroundColor={
                        line.type === "remove" ? "#3c1518" : "#132d13"
                      }
                    >
                      <Text
                        color={line.type === "remove" ? "red" : "green"}
                        bold
                      >
                        {line.type === "remove" ? " - " : " + "}
                      </Text>
                      <Text>{line.content} </Text>
                    </Text>
                  ))}
                </Box>
              )}
          </Box>
        );
      })}
    </Box>
  );
}

export type { ToolCallDisplay };
