import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import React, { useState } from "react";

import type { ToolCall } from "../agent/types.js";

interface ApprovalOption {
  id: "approve" | "reject";
  label: string;
  description: string;
}

const APPROVAL_OPTIONS: ApprovalOption[] = [
  { id: "approve", label: "Approve", description: "Execute this tool call" },
  {
    id: "reject",
    label: "Reject",
    description: "Block and return error to agent",
  },
];

function getToolSummary(call: ToolCall): string {
  const input = call.input;
  switch (call.name) {
    case "bash":
      return typeof input.command === "string" ? input.command : "";
    case "edit_file":
    case "write_file":
    case "read_file":
      return typeof input.path === "string" ? input.path : "";
    case "call_dust_agent":
      return typeof input.agent === "string" ? input.agent : "";
    case "task":
      return typeof input.description === "string" ? input.description : "";
    default:
      return JSON.stringify(input, null, 2);
  }
}

interface ToolApprovalSelectorProps {
  call: ToolCall;
  onApproval: (approved: boolean) => void;
}

export const ToolApprovalSelector: FC<ToolApprovalSelectorProps> = ({
  call,
  onApproval,
}) => {
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setCursor((prev) => (prev > 0 ? prev - 1 : APPROVAL_OPTIONS.length - 1));
      return;
    }

    if (key.downArrow) {
      setCursor((prev) => (prev < APPROVAL_OPTIONS.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return) {
      const selectedOption = APPROVAL_OPTIONS[cursor];
      onApproval(selectedOption.id === "approve");
      return;
    }
  });

  const summary = getToolSummary(call);

  return (
    <Box flexDirection="column">
      <Box paddingX={1} flexDirection="column" marginTop={1}>
        <Text color="yellow" bold>
          {call.name}
        </Text>
        {summary && <Text>{summary}</Text>}
      </Box>
      <Box paddingX={1} flexDirection="column">
        {APPROVAL_OPTIONS.map((option, index) => {
          const isSelected = index === cursor;
          return (
            <Box key={option.id} flexDirection="row">
              <Box width={15}>
                <Text
                  color={isSelected ? "blue" : undefined}
                  bold={isSelected}
                >
                  {option.label}
                </Text>
              </Box>
              <Text dimColor={!isSelected}>{option.description}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
