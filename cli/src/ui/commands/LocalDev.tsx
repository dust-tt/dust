import clipboardy from "clipboardy";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import { useClearTerminalOnMount } from "../../utils/hooks/use_clear_terminal_on_mount.js";
import { startFsServer } from "../../utils/servers/fsServer.js";
interface LocalDevProps {
  port?: number;
}

const LocalDev: FC<LocalDevProps> = ({ port }) => {
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useClearTerminalOnMount();

  // This useEffect handles starting the server after confirmedSelection is set
  useEffect(() => {
    if (!isServerStarted) {
      void startFsServer((url) => {
        setIsServerStarted(true);
        setServerUrl(url);
      }, port);
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
      </Box>
    );
  }

  return (
    <Box>
      <Text color="green">
        <Spinner type="dots" /> Initializing...
      </Text>
    </Box>
  );
};

export default LocalDev;
