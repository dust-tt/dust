import React, { FC } from "react";
import { Box, Text } from "ink";
import type { Result } from "meow";
import Auth from "./commands/Auth.js";
import Status from "./commands/Status.js";
import Logout from "./commands/Logout.js";
import AgentsMCP from "./commands/AgentsMCP.js";
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

  const command = input[0] || "help";

  switch (command) {
    case "login":
      return <Auth force={flags.force} />;
    case "status":
      return <Status />;
    case "logout":
      return <Logout />;
    case "agents-mcp":
      return <AgentsMCP port={flags.port} sId={flags.sId} />;
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
