import React, { FC } from "react";
import { Box, Text } from "ink";
import type { Result } from "meow";
import Auth from "./commands/Auth.js";
import Status from "./commands/Status.js";
import Logout from "./commands/Logout.js";

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
  }>;
}

const App: FC<AppProps> = ({ cli }) => {
  const { input, flags } = cli;

  if (flags.version) {
    return <Text>Dust CLI v{process.env.npm_package_version || "0.1.0"}</Text>;
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
      return (
        <Box flexDirection="column">
          <Text bold>Dust CLI</Text>
          <Text>A command-line interface for interacting with Dust.</Text>
          <Box marginTop={1}>
            <Text>Commands:</Text>
          </Box>
          <Box marginLeft={2}>
            <Text>
              <Text bold>auth</Text> Authenticate with Dust
            </Text>
          </Box>
          <Box marginLeft={2}>
            <Text>
              <Text bold>status</Text> Check authentication status
            </Text>
          </Box>
          <Box marginLeft={2}>
            <Text>
              <Text bold>logout</Text> Log out and clear saved tokens
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text>Options:</Text>
          </Box>
          <Box marginLeft={2}>
            <Text>
              <Text bold>--version, -v</Text> Show version
            </Text>
          </Box>
          <Box marginLeft={2}>
            <Text>
              <Text bold>--force, -f</Text> Force new authentication (with auth
              command)
            </Text>
          </Box>
          <Box marginLeft={2}>
            <Text>
              <Text bold>--help</Text> Show help
            </Text>
          </Box>
        </Box>
      );
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
