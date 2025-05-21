import { assertNever } from "@dust-tt/client";
import { Box, Static, Text } from "ink";
import Spinner from "ink-spinner";
import _ from "lodash";
import type { FC } from "react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useTerminalSize } from "../../utils/hooks/use_terminal_size.js";
import { clearTerminal } from "../../utils/terminal.js";
import { InputBox } from "./InputBox.js";

export type ConversationItem = { key: string } & (
  | {
      type: "welcome_header";
      agentName: string;
      agentId: string;
    }
  | {
      type: "user_message";
      firstName: string;
      content: string;
      index: number;
    }
  | {
      type: "agent_message_header";
      agentName: string;
      index: number;
    }
  | {
      type: "agent_message_cot_line";
      text: string;
      index: number;
    }
  | {
      type: "agent_message_content_line";
      text: string;
      index: number;
    }
  | {
      type: "agent_message_cancelled";
    }
  | {
      type: "separator";
    }
);

interface ConversationProps {
  conversationItems: ConversationItem[];
  isProcessingQuestion: boolean;
  userInput: string;
  cursorPosition: number;
  mentionPrefix: string;
  conversationId: string | null;
  stdout: NodeJS.WriteStream | null;
}

const _Conversation: FC<ConversationProps> = ({
  conversationItems,
  isProcessingQuestion,
  userInput,
  cursorPosition,
  mentionPrefix,
  conversationId,
  stdout,
}: ConversationProps) => {
  return (
    <Box flexDirection="column" height="100%">
      <Static items={conversationItems}>
        {(item) => {
          return (
            <StaticConversationItem
              item={item}
              stdout={stdout}
              key={item.key}
            />
          );
        }}
      </Static>

      {isProcessingQuestion && (
        <Box marginTop={1}>
          <Text color="green">
            Thinking <Spinner type="simpleDots" />
          </Text>
        </Box>
      )}

      <InputBox
        userInput={userInput}
        cursorPosition={cursorPosition}
        isProcessingQuestion={isProcessingQuestion}
        mentionPrefix={mentionPrefix}
      />
      <Box marginTop={0}>
        <Text dimColor>
          ↵ to send · \↵ for new line · ESC to clear
          {conversationId && "· Ctrl+G to open in browser"}
        </Text>
      </Box>
    </Box>
  );
};

interface StaticConversationItemProps {
  item: ConversationItem;
  stdout: NodeJS.WriteStream | null;
}

const StaticConversationItem: FC<StaticConversationItemProps> = ({
  item,
  stdout,
}) => {
  const terminalWidth = stdout?.columns || 80;
  const rightPadding = 4;

  switch (item.type) {
    case "welcome_header":
      return (
        <Box flexDirection="row" marginBottom={1}>
          <Box borderStyle="round" borderColor="gray" paddingX={1} paddingY={1}>
            <Box flexDirection="column">
              <Box justifyContent="center">
                <Text bold>Welcome to Dust CLI beta!</Text>
              </Box>
              <Box height={1}></Box>
              <Box justifyContent="center">
                <Text>
                  You&apos;re currently chatting with {item.agentName} (
                  {item.agentId})
                </Text>
              </Box>
              <Box height={1}></Box>
              <Box justifyContent="center">
                <Text dimColor>
                  Type your message below and press Enter to send
                </Text>
              </Box>
            </Box>
          </Box>
          <Box></Box>
        </Box>
      );
    case "user_message":
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="green">
              {item.firstName ?? "You"}
            </Text>
          </Box>
          <Box
            marginLeft={2}
            marginRight={rightPadding}
            flexDirection="column"
            width={terminalWidth - rightPadding - 2}
          >
            <Text wrap="wrap">
              {item.content.replace(/^\n+/, "").replace(/\n+$/, "")}
            </Text>
          </Box>
        </Box>
      );
    case "agent_message_header":
      return (
        <Box>
          <Text bold color="blue">
            {item.agentName}
          </Text>
        </Box>
      );
    case "agent_message_cot_line":
      return (
        <Box marginLeft={2}>
          <Text dimColor italic>
            {item.text}
          </Text>
        </Box>
      );
    case "agent_message_content_line":
      return (
        <Box marginLeft={2}>
          <Text>{item.text}</Text>
        </Box>
      );
    case "agent_message_cancelled":
      return (
        <Box marginBottom={1} marginTop={1}>
          <Text color="red">[Cancelled]</Text>
        </Box>
      );
    case "separator":
      return <Box height={1}></Box>;
    default:
      assertNever(item);
  }
};

/**
 * Wraps the _Conversation component to fully rerender it when the terminal is resized.
 * This also clears the terminal before rendering.
 * This is needed to prevent artifacts when terminal's width shrinks.
 */
const Conversation: React.FC<ConversationProps> = (props) => {
  const [renderKey, setRenderKey] = useState(0);
  const { columns } = useTerminalSize();
  const initRenderKey = useRef(false);

  const handleResize = useCallback(() => {
    void clearTerminal().then(() => setRenderKey((k) => k + 1));
  }, []);

  const debouncedHandleResize = useMemo(
    () => _.debounce(handleResize, 100),
    [handleResize]
  );

  useEffect(() => {
    if (!initRenderKey.current) {
      initRenderKey.current = true;
      return;
    }

    debouncedHandleResize();
    return debouncedHandleResize.cancel;
  }, [debouncedHandleResize, columns]);

  return <_Conversation {...props} key={renderKey.toString()} />;
};

export default Conversation;
