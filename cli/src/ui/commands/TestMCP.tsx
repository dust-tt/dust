import clipboardy from "clipboardy";
import { Box, Text, useInput } from "ink";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import { startTestMcpServer } from "../../mcp/servers/testServer.js";
import { useClearTerminalOnMount } from "../../utils/hooks/use_clear_terminal_on_mount.js";

interface TestMCPProps {
  port?: number;
}

const TestMCP: FC<TestMCPProps> = ({ port }) => {
  const [error, setError] = useState<string | null>(null);
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isServerStarted) {
      const startServer = async () => {
        const startRes = await startTestMcpServer(
          (url) => {
            setIsServerStarted(true);
            setServerUrl(url);
          },
          port
        );

        if (startRes.isErr()) {
          setError(startRes.error.message);
          process.exit(1);
        }
      };

      void startServer();
    }
  }, [isServerStarted, port]);

  // Handle 'c' key press to copy URL
  useInput((input) => {
    if (isServerStarted && serverUrl && input === "c") {
      const port = new URL(serverUrl).port;
      const url = `http://localhost:${port}/sse`;
      clipboardy.writeSync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  });

  const isCleared = useClearTerminalOnMount();
  if (!isCleared) {
    return null;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (isServerStarted) {
    const port = serverUrl ? new URL(serverUrl).port : "";

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        padding={1}
        borderColor="gray"
        marginTop={1}
      >
        <Text>
          Listening at: http://localhost:{port}/sse{" "}
          {copied && <Text color="green"> (Copied!)</Text>}
        </Text>

        <Box marginTop={1} flexDirection="row">
          <Text color="gray">Use MCP client to interact (Ctrl+C to stop).</Text>
          <Box marginLeft={1}>
            <Text color="gray">(Press &apos;c&apos; to copy URL)</Text>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>Test MCP Server - Dynamic Tool Management</Text>
          <Text color="gray">Type commands to manage tools:</Text>
          <Box flexDirection="column" paddingLeft={2} marginTop={1}>
            <Text color="cyan">  add &lt;name&gt;                - Add a new tool</Text>
            <Text color="cyan">  remove &lt;name&gt;             - Remove a tool</Text>
            <Text color="cyan">  rename &lt;oldName&gt; &lt;newName&gt; - Rename a tool</Text>
            <Text color="cyan">  list                      - List all tools</Text>
            <Text color="cyan">  help                      - Show help</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="green">Initializing test MCP server...</Text>
    </Box>
  );
};

export default TestMCP;

