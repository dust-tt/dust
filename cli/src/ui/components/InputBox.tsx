import { Box, Text } from "ink";
import React from "react";

interface InputBoxProps {
  userInput: string;
  cursorPosition: number;
  isProcessingQuestion: boolean;
  mentionPrefix: string;
}

export function InputBox({
  userInput,
  cursorPosition,
  isProcessingQuestion,
  mentionPrefix,
}: InputBoxProps) {
  let currentPos = 0;
  const lines = userInput.split("\n");
  const cursorLine = lines.findIndex((line) => {
    if (
      cursorPosition >= currentPos &&
      cursorPosition <= currentPos + line.length
    ) {
      return true;
    }
    currentPos += line.length + 1;
    return false;
  });

  const cursorPosInLine =
    cursorLine >= 0
      ? cursorPosition -
        (cursorLine === 0
          ? 0
          : lines
              .slice(0, cursorLine)
              .reduce((sum, line) => sum + line.length + 1, 0))
      : 0;

  return (
    <Box flexDirection="column" marginTop={0} paddingTop={0}>
      <Box
        borderStyle="round"
        borderColor="gray"
        padding={0}
        paddingX={1}
        marginTop={0}
      >
        <Box flexDirection="column">
          {
            // Find which line and position the cursor is on.
            lines.map((line, index) => (
              <Box key={index}>
                {index === 0 && (
                  <Text color={isProcessingQuestion ? "gray" : "cyan"} bold>
                    {mentionPrefix}
                  </Text>
                )}

                {index === cursorLine ? (
                  <>
                    <Text>{line.substring(0, cursorPosInLine)}</Text>
                    <Text
                      backgroundColor={isProcessingQuestion ? "gray" : "blue"}
                      color="white"
                    >
                      {line.charAt(cursorPosInLine) || " "}
                    </Text>
                    <Text>{line.substring(cursorPosInLine + 1)}</Text>
                  </>
                ) : (
                  // Regular line without cursor.
                  // For empty lines, just render a space to ensure the line is visible.
                  <Text>{line === "" ? " " : line}</Text>
                )}
              </Box>
            ))
          }
        </Box>
      </Box>
    </Box>
  );
}
