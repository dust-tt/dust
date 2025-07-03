import type { AgentActionSpecificEvent } from "@dust-tt/client";
import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import React, { useState } from "react";

interface ApprovalOption {
  id: "approve" | "reject";
  label: string;
}

const APPROVAL_OPTIONS: ApprovalOption[] = [
  { id: "approve", label: "Approve" },
  { id: "reject", label: "Reject" },
];

const formatInputs = (inputs: any): string => {
  if (!inputs) {
    return "";
  }

  if (typeof inputs === "string") {
    return inputs;
  }

  return JSON.stringify(inputs, null, 2);
};

interface ToolApprovalSelectorProps {
  event: AgentActionSpecificEvent & { type: "tool_approve_execution" };
  onApproval: (approved: boolean) => void;
}

export const ToolApprovalSelector: FC<ToolApprovalSelectorProps> = ({
  event,
  onApproval,
}) => {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
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

  if (!event) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        marginTop={1}
      >
        <Text color="blue" bold>
          Tool Execution Approval Required
        </Text>

        <Box marginBottom={1}>
          <Text>
            Agent {event.metadata.agentName} wants to use tool{" "}
            {event.metadata.toolName} from server {event.metadata.mcpServerName}
          </Text>
        </Box>

        {event.inputs && (
          <Box>
            <Box
              borderColor="white"
              borderStyle="round"
              marginX={1}
              width={100}
            >
              <Text color="white">{formatInputs(event.inputs)}</Text>
            </Box>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <Text bold>Use ↑/↓ arrows to navigate, Enter to confirm:</Text>
        <Box flexDirection="column" marginTop={1}>
          {APPROVAL_OPTIONS.map((option, index) => {
            const isFocused = index === cursor;
            return (
              <Box key={option.id} marginY={0}>
                <Text color={isFocused ? "white" : "gray"}>
                  {isFocused ? "> " : "  "}
                </Text>
                <Text
                  bold={isFocused}
                  backgroundColor={isFocused ? "gray" : undefined}
                >
                  {option.label}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
