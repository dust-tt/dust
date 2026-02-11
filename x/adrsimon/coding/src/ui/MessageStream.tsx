import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface MessageStreamProps {
  text: string;
  thinking: string;
  isStreaming: boolean;
  activeToolName?: string;
}

export function MessageStream({
  text,
  thinking,
  isStreaming,
  activeToolName,
}: MessageStreamProps) {
  return (
    <Box flexDirection="column">
      {thinking && (
        <Box marginBottom={1}>
          <Text color="gray" dimColor italic>
            {thinking}
          </Text>
        </Box>
      )}
      {text && <Text>{text}</Text>}
      {isStreaming && !text && !thinking && (
        <Box>
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
          <Text color="gray">
            {" "}
            {activeToolName
              ? `Running ${activeToolName}...`
              : "Thinking..."}
          </Text>
        </Box>
      )}
    </Box>
  );
}
