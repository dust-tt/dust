import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import clipboardy from "clipboardy";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { FC} from "react";
import React, { useEffect, useState } from "react";

import { useClearTerminalOnMount } from "../../utils/hooks/use_clear_terminal_on_mount.js";
import { startMcpServer } from "../../utils/mcpServer.js";
import AgentSelector from "../components/AgentSelector.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface AgentsMCPProps {
  port?: number;
  sId?: string[];
}

const AgentsMCP: FC<AgentsMCPProps> = ({ port, sId: requestedSIds }) => {
  const [error, setError] = useState<string | null>(null);
  const [confirmedSelection, setConfirmedSelection] = useState<
    AgentConfiguration[] | null
  >(null);
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useClearTerminalOnMount();

  // This useEffect handles starting the server after confirmedSelection is set
  useEffect(() => {
    if (confirmedSelection && !isServerStarted) {
      void startMcpServer(
        confirmedSelection,
        (url) => {
          setIsServerStarted(true);
          setServerUrl(url);
        },
        port
      );
    }
  }, [confirmedSelection, isServerStarted, port]);

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
