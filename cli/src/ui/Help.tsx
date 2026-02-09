import { Box, Text } from "ink";
import type { FC } from "react";
import React from "react";

const Help: FC = () => {
  return (
    <Box flexDirection="column">
      <Text bold>Dust CLI</Text>
      <Text>Chat with Dust agents from the terminal.</Text>

      <Box marginTop={1}>
        <Text bold>Examples:</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text color="cyan">dust</Text>
          {"                       "}Chat with @dust (default agent)
        </Text>
        <Text>
          <Text color="cyan">dust -a MyAgent</Text>
          {"              "}Chat with a specific agent
        </Text>
        <Text>
          <Text color="cyan">dust --resume</Text>
          {"                "}Resume a recent conversation
        </Text>
        <Text>
          <Text color="cyan">dust conversations</Text>
          {"          "}List recent conversations
        </Text>
        <Text>
          <Text color="cyan">dust -a MyAgent -m &quot;question&quot;</Text>
          {"  "}Non-interactive one-shot
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>Commands:</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text bold>chat</Text>
          {"          "}Chat with a Dust agent (default)
        </Text>
        <Text>
          <Text bold>conversations</Text>
          {" "}List recent conversations
        </Text>
        <Text>
          <Text bold>login</Text>
          {"         "}Authenticate with Dust
        </Text>
        <Text>
          <Text bold>status</Text>
          {"        "}Check authentication status
        </Text>
        <Text>
          <Text bold>logout</Text>
          {"        "}Log out and clear saved tokens
        </Text>
        <Text>
          <Text bold>agents-mcp</Text>
          {"    "}Select agents and start a stdio MCP server
        </Text>
        <Text>
          <Text bold>cache:clear</Text>
          {"   "}Clear agents cache
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>Chat Options:</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text bold>-a, --agent</Text>
          {"       "}Search for and use an agent by name
        </Text>
        <Text>
          <Text bold>--sId</Text>
          {"              "}Specify agent sId directly (can be repeated)
        </Text>
        <Text>
          <Text bold>-m, --message</Text>
          {"     "}Send a message non-interactively (requires --agent)
        </Text>
        <Text>
          <Text bold>-c, --conversationId</Text>
          {""}Conversation ID to resume or continue
        </Text>
        <Text>
          <Text bold>--resume</Text>
          {"           "}Resume a recent conversation
        </Text>
        <Text>
          <Text bold>--messageId</Text>
          {"        "}Display a specific message (with --conversationId)
        </Text>
        <Text>
          <Text bold>-d, --details</Text>
          {"     "}Show detailed message information
        </Text>
        <Text>
          <Text bold>--auto</Text>
          {"             "}Always accept file edits without prompting
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>Global Options:</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text bold>-h, --help</Text>
          {"        "}Display help information
        </Text>
        <Text>
          <Text bold>-v, --version</Text>
          {"     "}Display CLI version
        </Text>
        <Text>
          <Text bold>-f, --force</Text>
          {"       "}Force login even if already authenticated
        </Text>
        <Text>
          <Text bold>--noUpdateCheck</Text>
          {"   "}Skip update check
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>MCP Options:</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text bold>-p, --port</Text>
          {"        "}Specify the port for the MCP server
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>Authentication:</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text bold>--key</Text>
          {"              "}API key for headless authentication
        </Text>
        <Text>
          <Text bold>--workspaceId</Text>
          {"      "}Workspace ID for headless authentication
        </Text>
        <Text>
          <Text bold>DUST_API_KEY</Text>
          {"        "}Environment variable (overrides --key)
        </Text>
        <Text>
          <Text bold>DUST_WORKSPACE_ID</Text>
          {"  "}Environment variable (overrides --workspaceId)
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>Slash Commands (in chat):</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text color="cyan">/help</Text> /switch /new /resume /history /attach
          /clear-files /clear /info /export /auto /exit
        </Text>
      </Box>
    </Box>
  );
};

export default Help;
