import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import React, { useState } from "react";

interface DiffLine {
  type: "remove" | "add";
  lineNumber: number;
  content: string;
}

interface ApprovalOption {
  id: "accept" | "reject";
  label: string;
}

const APPROVAL_OPTIONS: ApprovalOption[] = [
  { id: "accept", label: "Accept" },
  { id: "reject", label: "Reject" },
];

interface DiffApprovalSelectorProps {
  diffLines: string[];
  filePath: string;
  onApproval: (approved: boolean) => void;
}

const parseDiffLines = (diffLines: string[]): DiffLine[] => {
  return diffLines.map((line) => {
    const isRemoval = line.startsWith("- ");
    const isAddition = line.startsWith("+ ");

    if (isRemoval || isAddition) {
      const type = isRemoval ? "remove" : "add";
      const content = line.substring(2);
      const colonIndex = content.indexOf(": ");
      const lineNumber =
        colonIndex > 0 ? parseInt(content.substring(0, colonIndex)) : 0;
      const lineContent =
        colonIndex > 0 ? content.substring(colonIndex + 2) : content;

      return {
        type,
        lineNumber,
        content: lineContent,
      };
    }

    return {
      type: "add",
      lineNumber: 0,
      content: line,
    };
  });
};

export const DiffApprovalSelector: FC<DiffApprovalSelectorProps> = ({
  diffLines,
  filePath,
  onApproval,
}) => {
  const [cursor, setCursor] = useState(0);
  const parsedDiffLines = parseDiffLines(diffLines);

  console.log("num of diff lines", diffLines.length);
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
      const approved = selectedOption.id === "accept";
      onApproval(approved);
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        marginTop={1}
      >
        <Text color="yellow" bold>
          Diff Preview for {filePath}
        </Text>

        <Box flexDirection="column" marginTop={1}>
          {parsedDiffLines.map((line, index) => (
            <Box key={index}>
              <Text color={line.type === "remove" ? "red" : "green"}>
                {line.type === "remove" ? "- " : "+ "}
                {line.lineNumber > 0 && `${line.lineNumber}: `}
                {line.content}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text bold>
          Do you approve these changes? Use ↑/↓ arrows to navigate, Enter to
          confirm:
        </Text>
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
                  color={option.id === "accept" ? "green" : "red"}
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
