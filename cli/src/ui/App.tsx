import { Box, Text } from "ink";
import type { Result } from "meow";
import type { FC } from "react";
import React from "react";

import AgentsMCP from "./commands/AgentsMCP.js";
import Auth from "./commands/Auth.js";
import Chat from "./commands/Chat.js";
import Logout from "./commands/Logout.js";
import Status from "./commands/Status.js";
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
  }>;
}

const App: FC<AppProps> = ({ cli }) => {
  const { input, flags } = cli;

  if (flags.version) {
    return <Text>Dust CLI v{process.env.npm_package_version || "0.1.0"}</Text>;
  }

  if (flags.help) {
    return <Help />;
  }

  const command = input[0] || "chat";

  switch (command) {
    case "login":
      return <Auth force={flags.force} />;
    case "status":
      return <Status />;
    case "logout":
      return <Logout />;
    case "agents-mcp":
      return <AgentsMCP port={flags.port} sId={flags.sId} />;
    case "chat":
      return <Chat sId={flags.sId?.[0]} />;
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
