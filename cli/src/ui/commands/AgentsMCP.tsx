import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import clipboardy from "clipboardy";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import { useClearTerminalOnMount } from "../../utils/hooks/use_clear_terminal_on_mount.js";
import { startMcpServer, startMcpServerStdio } from "../../utils/mcpServer.js";
import AgentSelector from "../components/AgentSelector.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface AgentsMCPProps {
  port?: number;
  sId?: string[];
  transport?: "stdio" | "http";
}

const AgentsMCP: FC<AgentsMCPProps> = ({
  port,
  sId: requestedSIds,
  transport = "http",
}) => {
  const [error, setError] = useState<string | null>(null);
  const [confirmedSelection, setConfirmedSelection] = useState<
    AgentConfiguration[] | null
  >(null);
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // This useEffect handles starting the server after confirmedSelection is set
  useEffect(() => {
    if (confirmedSelection && !isServerStarted) {
      if (transport === "stdio") {
        void startMcpServerStdio(confirmedSelection).then(() => {
          setIsServerStarted(true);
          setServerUrl("stdio://");
        });
      } else {
        void startMcpServer(
          confirmedSelection,
          (url) => {
            setIsServerStarted(true);
            setServerUrl(url);
          },
          port
        );
      }
    }
  }, [confirmedSelection, isServerStarted, port, transport]);

  // Handle 'c' key press to copy URL (only for HTTP mode)
  useInput(
    (input) => {
      if (
        isServerStarted &&
        serverUrl &&
        input === "c" &&
        serverUrl !== "stdio://"
      ) {
        try {
          const port = new URL(serverUrl).port;
          const url = `http://localhost:${port}/sse`;
          clipboardy.writeSync(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (error) {
          // Invalid URL format, ignore
        }
      }
    },
    { isActive: serverUrl !== "stdio://" }
  );

  const isCleared = useClearTerminalOnMount();
  if (!isCleared) {
    return null;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!confirmedSelection?.length) {
    return (
      <AgentSelector
        requestedSIds={requestedSIds}
        onError={setError}
        onConfirm={setConfirmedSelection}
      />
    );
  }

  if (isServerStarted) {
    const isStdio = serverUrl === "stdio://";
    let port = "";

    if (serverUrl && !isStdio) {
      try {
        port = new URL(serverUrl).port;
      } catch (error) {
        // Invalid URL format, leave port empty
      }
    }

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        padding={1}
        borderColor="gray"
        marginTop={1}
      >
        {isStdio ? (
          <Text>
            MCP server running with STDIO transport{" "}
            <Text color="green">(Ready for AI clients)</Text>
          </Text>
        ) : (
          <Text>
            Listening at: http://localhost:{port}/sse{" "}
            {copied && <Text color="green"> (Copied!)</Text>}
          </Text>
        )}

        <Box marginTop={1} flexDirection="row">
          <Text color="gray">
            {isStdio
              ? "Connected via stdin/stdout (Ctrl+C to stop)."
              : "Use MCP client to interact (Ctrl+C to stop)."}
          </Text>
          {!isStdio && (
            <Box marginLeft={1}>
              <Text color="gray">(Press &apos;c&apos; to copy URL)</Text>
            </Box>
          )}
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>Selected Agents:</Text>
          {confirmedSelection.length === 0 ? (
            <Text color="yellow"> No agents selected.</Text>
          ) : (
            confirmedSelection.map((agent) => (
              <Text key={agent.sId}>
                {" "}
                - {agent.name} ({agent.sId})
              </Text>
            ))
          )}
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

export default AgentsMCP;
