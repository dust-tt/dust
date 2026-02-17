import { assertNever } from "@dust-tt/client";
import { Box, Static, Text } from "ink";
import Spinner from "ink-spinner";
// biome-ignore lint/plugin/noBulkLodash: existing usage
import _ from "lodash";
import type { FC } from "react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { formatFileSize, isImageFile } from "../../utils/fileHandling.js";
import { useTerminalSize } from "../../utils/hooks/use_terminal_size.js";
import { clearTerminal } from "../../utils/terminal.js";
import type { Command } from "../commands/types.js";
import { CommandSelector } from "./CommandSelector.js";
import type { UploadedFile } from "./FileUpload.js";
import type { InlineSelectorItem } from "./InlineSelector.js";
import { InlineSelector } from "./InlineSelector.js";
import { InputBox } from "./InputBox.js";

export type ConversationItem = { key: string } & (
  | {
      type: "welcome_header";
      agentName: string;
      agentDescription: string;
    }
  | {
      type: "user_message";
      firstName: string;
      content: string;
      index: number;
    }
  | {
      type: "user_message_attachments";
      attachments: UploadedFile[];
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
  actionStatus: string | null;
  userInput: string;
  cursorPosition: number;
  mentionPrefix: string;
  conversationId: string | null;
  stdout: NodeJS.WriteStream | null;
  showCommandSelector: boolean;
  commandQuery: string;
  selectedCommandIndex: number;
  commandCursorPosition: number;
  commands?: Command[];
  autoAcceptEdits: boolean;
  inlineSelector?: {
    items: InlineSelectorItem[];
    query: string;
    selectedIndex: number;
    prompt?: string;
    header?: React.ReactNode;
  } | null;
}

const _Conversation: FC<ConversationProps> = ({
  conversationItems,
  isProcessingQuestion,
  actionStatus,
  userInput,
  cursorPosition,
  mentionPrefix,
  conversationId,
  stdout,
  showCommandSelector,
  commandQuery,
  selectedCommandIndex,
  commandCursorPosition,
  commands = [],
  autoAcceptEdits,
  inlineSelector,
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
          {actionStatus ? (
            <Text color="yellow">
              {actionStatus}<Spinner type="simpleDots" />
            </Text>
          ) : (
            <Text color="green">
              Thinking<Spinner type="simpleDots" />
            </Text>
          )}
        </Box>
      )}

      <InputBox
        userInput={showCommandSelector ? `/${commandQuery}` : userInput}
        cursorPosition={
          showCommandSelector ? commandCursorPosition + 1 : cursorPosition
        }
        isProcessingQuestion={isProcessingQuestion}
        mentionPrefix={mentionPrefix}
        autoAcceptEdits={autoAcceptEdits}
      />
      {showCommandSelector && (
        <CommandSelector
          query={commandQuery}
          selectedIndex={selectedCommandIndex}
          commands={commands}
          onSelect={() => {}}
        />
      )}
      {!showCommandSelector && inlineSelector && (
        <InlineSelector
          items={inlineSelector.items}
          query={inlineSelector.query}
          selectedIndex={inlineSelector.selectedIndex}
          prompt={inlineSelector.prompt}
          header={inlineSelector.header}
        />
      )}
      {!showCommandSelector && !inlineSelector && (
        <Box marginTop={0} paddingLeft={1}>
          <Text dimColor>
            ↵ to send · \↵ for new line · ESC to clear
            {conversationId && " · Ctrl+G to open in browser"}
          </Text>
        </Box>
      )}
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
    case "welcome_header": {
      const cwd = process.cwd();
      const home = process.env.HOME || "";
      const displayPath =
        home && cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;

      return (
        <Box marginTop={1} marginBottom={1}>
          <Box flexDirection="column" marginRight={2}>
            <Box>
              <Text color="green" dimColor>
                {"█"}
              </Text>
              <Text color="green">{"▀▄ "}</Text>
              <Text color="red" dimColor>
                {"█ █"}
              </Text>
            </Box>
            <Box>
              <Text color="green" dimColor>
                {"█"}
              </Text>
              <Text color="green">{"▄▀ "}</Text>
              <Text color="red">{"█▄█"}</Text>
            </Box>
            <Box>
              <Text color="blue" dimColor>
                {"█▀▀ "}
              </Text>
              <Text color="blue" dimColor>
                {"▀█▀"}
              </Text>
            </Box>
            <Box>
              <Text color="blue">{"▄██ "}</Text>
              <Text color="yellow" dimColor>
                {" █ "}
              </Text>
            </Box>
          </Box>
          <Box flexDirection="column" justifyContent="center">
            <Text dimColor>
              Dust CLI v{process.env.npm_package_version || "0.1.0"} ·{" "}
              {displayPath}
            </Text>
            <Text dimColor>
              Chatting with{" "}
              <Text bold dimColor>
                @{item.agentName}
              </Text>
              {" · "}Use{" "}
              <Text bold dimColor>
                /switch
              </Text>{" "}
              to change agent.
            </Text>
            <Text dimColor>
              Type your message below and press Enter to send.
            </Text>
          </Box>
        </Box>
      );
    }
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
    case "user_message_attachments":
      return (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Box borderStyle="round" borderColor="gray" padding={1}>
            <Box flexDirection="column">
              <Text color="gray" bold>
                📎 {item.attachments.length} attachment
                {item.attachments.length > 1 ? "s" : ""}
              </Text>
              {item.attachments.map((file, index) => {
                const isImage = isImageFile(file.fileName);
                return (
                  <Box key={index}>
                    <Text color={isImage ? "yellow" : "cyan"}>
                      {isImage ? "🖼️  " : "📄 "} {file.fileName}
                    </Text>
                    <Text color="gray"> ({formatFileSize(file.fileSize)})</Text>
                  </Box>
                );
              })}
            </Box>
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
