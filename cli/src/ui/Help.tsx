import React, { FC } from "react";
import { Box, Text } from "ink";

const Help: FC = () => {
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
      <Box marginLeft={2}>
        <Text>
          <Text bold>agents-mcp</Text> Select agents and start a stdio MCP
          server
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>Options:</Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>-f, --force</Text> Force login even if already
          authenticated
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>-h, --help</Text> Display help information
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>-v, --version</Text> Display CLI version
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>-p, --port</Text> Specify the port for the MCP server
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>--sId</Text> Specify agent sId(s) to use directly (can be
          repeated)
        </Text>
      </Box>
    </Box>
  );
};

export default Help;
