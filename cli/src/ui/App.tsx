import { Box, Text } from "ink";
import type { Result } from "meow";
import type { FC } from "react";
import React, { useCallback, useState } from "react";

import AgentsMCP from "./commands/AgentsMCP.js";
import Auth from "./commands/Auth.js";
import Cache from "./commands/Cache.js";
import Chat from "./commands/Chat.js";
import Logout from "./commands/Logout.js";
import NonInteractiveChat from "./commands/NonInteractiveChat.js";
import Status from "./commands/Status.js";
import TestChat from "./commands/TestChat.js";
import UpdateInfo from "./components/UpdateInfo.js";
import Help from "./Help.js";

interface AppProps {
  cli: Result<{
    version: {
      type: "boolean";
      shortFlag: "v";
    };
    force: {
      type: "boolean";
      shortFlag: "f";
    };
    help: {
      type: "boolean";
      shortFlag: "h";
    };
    port: {
      type: "number";
      shortFlag: "p";
    };
    sId: {
      type: "string";
      shortFlag: "s";
      isMultiple: true;
    };
    agent: {
      type: "string";
      shortFlag: "a";
    };
    message: {
      type: "string";
      shortFlag: "m";
    };
    conversationId: {
      type: "string";
      shortFlag: "c";
    };
    messageId: {
      type: "string";
    };
    details: {
      type: "boolean";
      shortFlag: "d";
    };
    auto: {
      type: "boolean";
    };
    noUpdateCheck: {
      type: "boolean";
    };
    key: {
      type: "string";
    };
    workspaceId: {
      type: "string";
    };
  }>;
}

const App: FC<AppProps> = ({ cli }) => {
  const [updateCheckComplete, setUpdateCheckComplete] = useState(false);
  const { input, flags } = cli;

  const handleUpdateComplete = useCallback(() => {
    setUpdateCheckComplete(true);
  }, []);

  if (flags.version) {
    return <Text>Dust CLI v{process.env.npm_package_version || "0.1.0"}</Text>;
  }

  if (flags.help) {
    return <Help />;
  }

  // Show update info unless --noUpdateCheck flag is set or check is complete
  if (!flags.noUpdateCheck && !updateCheckComplete) {
    return <UpdateInfo onComplete={handleUpdateComplete} />;
  }

  const command = input[0] || "chat";

  switch (command) {
    case "login":
      return (
        <Auth force={flags.force} apiKey={flags.key} wId={flags.workspaceId} />
      );
    case "status":
      return <Status />;
    case "logout":
      return <Logout />;
    case "agents-mcp":
      return <AgentsMCP port={flags.port} sId={flags.sId} />;
    case "chat":
      // Check if this is a non-interactive chat operation
      if (flags.message || flags.messageId) {
        return (
          <NonInteractiveChat
            agentSearch={flags.agent}
            message={flags.message}
            conversationId={flags.conversationId}
            messageId={flags.messageId}
            details={flags.details}
          />
        );
      }
      // Interactive chat
      return (
        <Chat
          sId={flags.sId?.[0]}
          agentSearch={flags.agent}
          conversationId={flags.conversationId}
          autoAcceptEditsFlag={flags.auto}
        />
      );
    case "cache:clear":
      return <Cache />;
    case "test-chat":
      return <TestChat apiKey={process.env.MISTRAL_API_KEY} />;
    case "help":
      return <Help />;
    default:
      return (
        <Box flexDirection="column">
          <Text color="red">Unknown command: {command}</Text>
          <Box marginTop={1}>
            <Help />
          </Box>
        </Box>
      );
  }
};

export default App;
