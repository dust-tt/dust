import chalk from "chalk";
import { structuredPatch } from "diff";
import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import React, { useState } from "react";

// Modern pastel color palette inspired by contemporary CLI tools
const COLORS = {
  // Pastel greens for additions - softer than traditional bright green
  addedBg: "#B5EAD7", // Mint green pastel
  addedFg: "#2D5A3D", // Darker green for contrast
  addedAccent: "#A8FFB8", // Light mint accent

  // Pastel corals/reds for removals - warmer than harsh red
  removedBg: "#FFD4D4", // Soft coral pink
  removedFg: "#8B3A3A", // Muted red-brown
  removedAccent: "#FFB8B8", // Light coral

  // Neutral pastels for context and UI
  contextFg: "#6B7280", // Soft gray
  headerBg: "#F8FAFC", // Very light blue-gray
  headerFg: "#4A5568", // Darker gray for headers

  // Accent colors for interactive elements
  focusColor: "#A78BFA", // Soft purple
  borderColor: "#E2E8F0", // Light gray border

  // Background tones
  cardBg: "#FEFEFE", // Off-white
  subtleBg: "#F7FAFC", // Very light blue tint
} as const;

const TYPE_MAP = {
  remove: { color: COLORS.removedFg, symbol: "▌ " },
  add: { color: COLORS.addedFg, symbol: "▌ " },
  context: { color: COLORS.contextFg, symbol: "  " },
};

interface DiffLine {
  type: "remove" | "add" | "context";
  lineNumber: number;
  content: string;
}

interface ApprovalOption {
  id: "accept" | "reject";
  label: string;
  symbol: string;
}

const APPROVAL_OPTIONS: ApprovalOption[] = [
  { id: "accept", label: "Accept", symbol: "✓" },
  { id: "reject", label: "Reject", symbol: "✗" },
];

interface DiffApprovalSelectorProps {
  originalContent: string;
  updatedContent: string;
  filePath: string;
  onApproval: (approved: boolean) => void;
}

export const DiffApprovalSelector: FC<DiffApprovalSelectorProps> = ({
  originalContent,
  updatedContent,
  filePath,
  onApproval,
}) => {
  const [cursor, setCursor] = useState(0);

  const patch = structuredPatch(
    filePath,
    filePath,
    originalContent,
    updatedContent,
    undefined,
    undefined,
    {
      context: 3,
    }
  );

  const parsedDiffLines: DiffLine[] = [];
  patch.hunks.forEach((hunk) => {
    let oldLineNum = hunk.oldStart;
    let newLineNum = hunk.newStart;

    hunk.lines.forEach((line) => {
      if (line.startsWith("-")) {
        parsedDiffLines.push({
          type: "remove",
          lineNumber: oldLineNum,
          content: line.substring(1),
        });
        oldLineNum++;
      } else if (line.startsWith("+")) {
        parsedDiffLines.push({
          type: "add",
          lineNumber: newLineNum,
          content: line.substring(1),
        });
        newLineNum++;
      } else {
        if (line === "\\ No newline at end of file") {
          return;
        }
        parsedDiffLines.push({
          type: "context",
          lineNumber: oldLineNum,
          content: line.substring(1),
        });
        oldLineNum++;
        newLineNum++;
      }
    });
  });

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
    <Box flexDirection="column" gap={1}>
      {/* Modern header with subtle styling */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={3}
        paddingY={1}
        marginBottom={1}
      >
        <Box marginBottom={1}>
          <Text color="blue" bold>
            {chalk.hex(COLORS.headerFg)("Changes Preview")}
          </Text>
          <Text color="gray">
            {chalk.hex(COLORS.contextFg)(` • ${filePath}`)}
          </Text>
        </Box>

        {/* Diff content with modern pastel styling */}
        <Box flexDirection="column" gap={0}>
          {parsedDiffLines.map((line, index) => {
            const { color, symbol } = TYPE_MAP[line.type] || {};

            return (
              <Box key={index} paddingLeft={1}>
                <Text>
                  {chalk.hex(color)(symbol)}
                  {chalk.hex(color)(`${line.lineNumber}: ${line.content}`)}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Modern action section with glassmorphism-inspired styling */}
      <Box flexDirection="column" paddingX={3} gap={1}>
        <Box marginBottom={1}>
          <Text>
            {
              chalk
                .hex(COLORS.headerFg)
                .bold("Review Decision") /* Professional, no emoji */
            }
          </Text>
        </Box>

        <Text>
          {chalk.hex(COLORS.contextFg)("Use ↑/↓ to navigate, Enter to confirm")}
        </Text>

        <Box flexDirection="column" gap={0} marginTop={1}>
          {APPROVAL_OPTIONS.map((option, index) => {
            const isFocused = index === cursor;
            const isAccept = option.id === "accept";

            return (
              <Box key={option.id} paddingY={0}>
                <Text>
                  {isFocused ? chalk.hex(COLORS.focusColor)("▶ ") : "  "}
                  {isFocused
                    ? chalk
                        .hex(COLORS.focusColor)
                        .bold(`${option.symbol} ${option.label}`)
                    : isAccept
                      ? chalk.hex(COLORS.addedFg)(
                          `${option.symbol} ${option.label}`
                        )
                      : chalk.hex(COLORS.removedFg)(
                          `${option.symbol} ${option.label}`
                        )}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
