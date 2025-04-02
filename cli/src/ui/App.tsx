import React, { FC } from "react";
import { Box, Text } from "ink";
import type { Result } from "meow";
import Auth from "./commands/Auth.js";
import Status from "./commands/Status.js";
import Logout from "./commands/Logout.js";
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
    case "auth":
      return <Auth force={flags.force} />;
    case "status":
      return <Status />;
    case "logout":
      return <Logout />;
    case "help":
      return <Help />;
    default:
      return (
        <Box flexDirection="column">
          <Text color="red">Unknown command: {command}</Text>
          <Text>Run </Text>
          <Text color="green">dust help</Text>
          <Text> to see available commands.</Text>
        </Box>
      );
  }
};

export default App;
