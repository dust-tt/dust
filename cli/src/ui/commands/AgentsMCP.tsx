import type { AgentConfigurationType } from "@dust-tt/types";
import clipboardy from "clipboardy";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import { useClearTerminalOnMount } from "../../utils/hooks/use_clear_terminal_on_mount.js";
import { startMcpServer } from "../../utils/mcpServer.js";
import AgentSelector from "../components/AgentSelector.js"; // May still be needed

interface AgentsMCPProps {
  port?: number;
  requestedSIds?: string[]; // sIds passed from CLI flags
  initialAgentConfigurations: AgentConfigurationType[] | null; // All agents or those specified by sId
  isUsingCachedData?: boolean;
}

const AgentsMCP: FC<AgentsMCPProps> = ({
  port,
  requestedSIds,
  initialAgentConfigurations,
  isUsingCachedData,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentsToRun, setSelectedAgentsToRun] = useState<
    AgentConfigurationType[] | null
  >(null);
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [needsSelection, setNeedsSelection] = useState(false);

  useClearTerminalOnMount();

  useEffect(() => {
    setError(null);
    if (initialAgentConfigurations) {
      if (requestedSIds && requestedSIds.length > 0) {
        const foundAgents = initialAgentConfigurations.filter((agent) =>
          requestedSIds.includes(agent.sId)
        );
        if (foundAgents.length === requestedSIds.length) {
          setSelectedAgentsToRun(foundAgents);
          setNeedsSelection(false);
        } else {
          const missingSIds = requestedSIds.filter(
            (sId) => !foundAgents.find((a) => a.sId === sId)
          );
          setError(
            `Agent(s) with sId(s) "${missingSIds.join(
              ", "
            )}" not found in the provided configurations.`
          );
          setNeedsSelection(false);
        }
      } else {
        // No sIds requested, means we need to select from all available initialAgentConfigurations
        // Or, if initialAgentConfigurations has only one, we can use it directly.
        // For now, always trigger selection if no sIds are specified.
        setNeedsSelection(true);
        setSelectedAgentsToRun(null); // Clear previous selection if any
      }
    } else {
      // initialAgentConfigurations is null (still loading from App.tsx or error there)
      // This component should ideally show a loading or error message passed from App.tsx
      // For now, it will simply not set selectedAgentsToRun.
      setSelectedAgentsToRun(null);
      setNeedsSelection(false);
    }
  }, [initialAgentConfigurations, requestedSIds]);

  // This useEffect handles starting the server after selectedAgentsToRun is set
  useEffect(() => {
    if (selectedAgentsToRun && !isServerStarted) {
      // TODO: Handle server restart if selectedAgentsToRun changes while server is running.
      // This is complex. For now, we only start once.
      // A change in initialAgentConfigurations from App.tsx due to background update
      // will filter down here. If selectedAgentsToRun changes, and server is running,
      // user should be notified.
      void startMcpServer(
        selectedAgentsToRun,
        (url) => {
          setIsServerStarted(true);
          setServerUrl(url);
        },
        port,
        isUsingCachedData // Pass this to mcpServer
      );
    }
    // Note: isUsingCachedData is not a dependency here as we don't want to restart the server
    // just because the "cached" status message changes. The configurations themselves would need to change.
  }, [selectedAgentsToRun, isServerStarted, port]);

  // Handle 'c' key press to copy URL
  useInput((input) => {
    if (isServerStarted && serverUrl && input === "c") {
      const urlPort = new URL(serverUrl).port;
      const urlToCopy = `http://localhost:${urlPort}/sse`;
      clipboardy.writeSync(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  });

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (needsSelection && initialAgentConfigurations) {
    return (
      <AgentSelector
        availableAgents={initialAgentConfigurations} // Pass all available agents
        onError={setError}
        onConfirm={(confirmedAgents) => {
          setSelectedAgentsToRun(confirmedAgents);
          setNeedsSelection(false);
        }}
        multiSelect={true} // MCP can run multiple agents
      />
    );
  }

  if (!selectedAgentsToRun || selectedAgentsToRun.length === 0) {
    if (!initialAgentConfigurations) {
      // This case should be handled by App.tsx's loading/error states mostly
      return (
        <Text>
          <Spinner type="dots" /> Waiting for agent configurations...
        </Text>
      );
    }
    // If initialAgentConfigurations are present but selection resulted in empty or error
    return <Text color="yellow">No agents selected or available to run.</Text>;
  }

  if (isServerStarted && serverUrl) {
    const urlPort = new URL(serverUrl).port;

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        padding={1}
        borderColor="gray"
        marginTop={1}
      >
        {isUsingCachedData && (
          <Text dimColor>
            (Running with cached configurations. Updates may be fetched in
            background)
          </Text>
        )}
        <Text>
          MCP Server listening at: http://localhost:{urlPort}/sse{" "}
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
          {selectedAgentsToRun.map((agent) => (
            <Text key={agent.sId}>
              {" "}
              - {agent.name} ({agent.sId})
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="green">
        <Spinner type="dots" /> Initializing MCP server with selected agents...
      </Text>
    </Box>
  );
};

export default AgentsMCP;
