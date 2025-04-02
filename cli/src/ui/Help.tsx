import React from "react";
import { Box, Text } from "ink";

const Help = () => {
  return (
    <Box flexDirection="column">
      <Text bold>Dust CLI</Text>
      <Text>A command-line interface for interacting with Dust.</Text>
      <Box marginTop={1}>
        <Text>Commands:</Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>login</Text> Authenticate with Dust
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
          <Text bold>--force, -f</Text> Force new authentication (with login
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
};

export default Help;
