import { Box, Text } from "ink";
import type { FC } from "react";
import React from "react";

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
          <Text bold>chat</Text> Chat with a Dust agent (default)
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>agents-mcp</Text> Select agents and start a stdio MCP
          server
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>cache:clear</Text> Clear agents cache
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
      <Box marginLeft={2}>
        <Text>
          <Text bold>-a, --agent</Text> Search for and use an agent by name
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>-m, --message</Text> Send a message non-interactively
          (requires --agent)
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>-c, --conversationId</Text> Conversation ID (use with
          --agent and --message, or with --messageId)
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>--messageId</Text> Display details of a specific message
          (requires --conversationId)
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>-d, --details</Text> Show detailed message information
          (requires --agent and --message)
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>--auto</Text> Always accept edit operations without
          prompting for approval
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>--key</Text> API key for headless authentication (use with
          --workspaceId)
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>--wId</Text> Workspace ID for headless authentication (use
          with --api-key)
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>Environment Variables:</Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>DUST_API_KEY</Text> API key for headless authentication
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>
          <Text bold>DUST_WORKSPACE_ID</Text> Workspace ID for headless
          authentication
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text italic>
            Note: Environment variables take precedence over command-line flags
          </Text>
        </Text>
      </Box>
    </Box>
  );
};

export default Help;
