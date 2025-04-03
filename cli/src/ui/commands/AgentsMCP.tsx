import React, { FC, ReactNode, useCallback, useEffect, useState } from "react";
import { Box, Text, useStdout, useInput } from "ink";
import Spinner from "ink-spinner";
import { getDustClient } from "../../utils/dustClient.js";
import AuthService from "../../utils/authService.js";
import { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import {
  MultiSelectWithSearch,
  BaseItem,
} from "../components/MultiSelectWithSearch.js";
import { startMcpServer } from "../../utils/mcpServer.js";
import process from "process";
import clipboardy from "clipboardy";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface AgentItem extends BaseItem {
  description: string;
  scope?: string;
  userFavorite?: boolean;
}

interface AgentsMCPProps {
  port?: number;
  sId?: string[];
}

const AgentsMCP: FC<AgentsMCPProps> = ({ port, sId: requestedSIds }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [allAgents, setAllAgents] = useState<AgentConfiguration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    null
  );
  const [confirmedSelection, setConfirmedSelection] = useState<string[] | null>(
    null
  );
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { stdout } = useStdout();

  // Clear the terminal on mount
  useEffect(() => {
    process.stdout.write("\x1bc");
  }, []);

  useEffect(() => {
    const fetchAgentsAndStartServer = async () => {
      setIsLoading(true);
      setError(null);

      const workspaceId = await AuthService.getSelectedWorkspaceId();
      if (!workspaceId) {
        setError(
          "No workspace selected. Run `dust login` to select a workspace."
        );
        setIsLoading(false);
        return;
      }
      setCurrentWorkspaceId(workspaceId);

      const dustClient = await getDustClient();
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsLoading(false);
        return;
      }

      const agentsRes = await dustClient.getAgentConfigurations({
        view: "all",
      });

      if (agentsRes.isErr()) {
        setError(`API Error fetching agents: ${agentsRes.error.message}`);
        setIsLoading(false);
        return;
      }

      setAllAgents(agentsRes.value);

      // If sIds were provided via CLI, validate and use them directly
      if (requestedSIds && requestedSIds.length > 0) {
        const validRequestedAgents = agentsRes.value.filter((agent) =>
          requestedSIds.includes(agent.sId)
        );
        const invalidSIds = requestedSIds.filter(
          (id) => !validRequestedAgents.some((agent) => agent.sId === id)
        );

        if (invalidSIds.length > 0) {
          setError(`Invalid agent sId(s) provided: ${invalidSIds.join(", ")}`);
          setIsLoading(false);
          return;
        }

        if (validRequestedAgents.length === 0) {
          setError("No valid agents found for the provided sId(s).");
          setIsLoading(false);
          return;
        }

        // Directly set confirmedSelection and trigger server start
        setConfirmedSelection(validRequestedAgents.map((a) => a.sId));
      } else {
        // Proceed to interactive selection
        setIsLoading(false);
      }
    };

    fetchAgentsAndStartServer();
  }, [requestedSIds]);

  // This useEffect handles starting the server after confirmedSelection is set
  useEffect(() => {
    if (confirmedSelection && currentWorkspaceId && !isServerStarted) {
      // Find selected agent objects
      const selectedAgentObjects = allAgents.filter((agent) =>
        confirmedSelection.includes(agent.sId)
      );

      startMcpServer(
        selectedAgentObjects,
        currentWorkspaceId,
        (url) => {
          setIsServerStarted(true);
          setServerUrl(url);
        },
        port
      );
    }
  }, [
    confirmedSelection,
    currentWorkspaceId,
    allAgents,
    isServerStarted,
    port,
  ]);

  const renderAgentItem = useCallback(
    (item: AgentItem, isSelected: boolean, isFocused: boolean): ReactNode => {
      const termWidth = stdout?.columns || 80;
      const descriptionIndent = 3;
      const maxDescWidth = termWidth - descriptionIndent;

      let truncatedDescription = "";
      let needsEllipsis = false;
      const originalLines = (item.description || "").split("\n");

      if (originalLines.length > 0) {
        const line1 = originalLines[0];
        if (line1.length > maxDescWidth) {
          truncatedDescription += line1.substring(0, maxDescWidth - 3) + "...";
          needsEllipsis = true;
        } else {
          truncatedDescription += line1;
        }
        if (originalLines.length > 1 && !needsEllipsis) {
          const line2 = originalLines[1];
          truncatedDescription += "\n";
          if (line2.length > maxDescWidth) {
            truncatedDescription +=
              line2.substring(0, maxDescWidth - 3) + "...";
            needsEllipsis = true;
          } else {
            truncatedDescription += line2;
          }
        }
        if (originalLines.length > 2 && !needsEllipsis) {
          truncatedDescription += "\n...";
        }
      }

      const indicator = isFocused ? "> " : "  ";
      const selectionMark = isSelected ? "x" : " ";

      return (
        <Box key={item.id} flexDirection="column">
          <Text color={isFocused ? "blue" : undefined}>
            {`${indicator}[`}
            <Text bold={isSelected}>{selectionMark}</Text>
            {`] ${item.label} (${item.id})`}
          </Text>
          {truncatedDescription && (
            <Box marginLeft={descriptionIndent}>
              <Text dimColor>{truncatedDescription}</Text>
            </Box>
          )}
        </Box>
      );
    },
    [stdout?.columns]
  );

  const renderSelectedAgentItem = useCallback((item: AgentItem): ReactNode => {
    return (
      <Text key={item.id}>
        - {item.label} ({item.id})
      </Text>
    );
  }, []);

  const handleConfirm = useCallback((selectedIds: string[]) => {
    setConfirmedSelection(selectedIds);
  }, []);

  // Handle 'c' key press to copy URL
  useInput((input, key) => {
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

  // 1. Show loading indicator if fetching initial data or if starting directly via sId
  if (isLoading && (!confirmedSelection || isServerStarted === false)) {
    const loadingMessage =
      requestedSIds && requestedSIds.length > 0
        ? "Fetching agent details and starting server..."
        : "Fetching agents...";
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" /> {loadingMessage}
        </Text>
      </Box>
    );
  }

  // 2. If selection is confirmed (either via CLI or interactive) and server is not started yet
  if (confirmedSelection && !isServerStarted) {
    const orderedSelectedAgents = confirmedSelection
      .map((id) => allAgents.find((agent) => agent.sId === id))
      .filter((agent): agent is AgentConfiguration => agent !== undefined);

    return (
      <Box flexDirection="column">
        <Text>Starting MCP Server with selected agents:</Text>
        {orderedSelectedAgents.length === 0 ? (
          <Text color="yellow"> None</Text>
        ) : (
          orderedSelectedAgents.map((agent) => (
            <Text key={agent.sId}>
              - {agent.name} ({agent.sId})
            </Text>
          ))
        )}
        <Box marginTop={1}>
          <Text color="green">
            <Spinner type="dots" /> Starting...
          </Text>
        </Box>
      </Box>
    );
  }

  // 3. If server is started (final state)
  if (isServerStarted) {
    const port = serverUrl ? new URL(serverUrl).port : "";
    const orderedSelectedAgents = confirmedSelection
      ? confirmedSelection
          .map((id) => allAgents.find((agent) => agent.sId === id))
          .filter((agent): agent is AgentConfiguration => agent !== undefined)
      : [];

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
            <Text color="gray">(Press 'c' to copy URL)</Text>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>Selected Agents:</Text>
          {orderedSelectedAgents.length === 0 ? (
            <Text color="yellow"> No agents selected.</Text>
          ) : (
            orderedSelectedAgents.map((agent) => (
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

  // 4. If no sIds provided and not loading, show interactive selector
  // Ensure allAgents is populated before rendering MultiSelect
  if (!isLoading && allAgents.length > 0) {
    const agentItems: AgentItem[] = allAgents.map((agent) => ({
      id: agent.sId,
      label: agent.name,
      description: agent.description,
    }));

    return (
      <MultiSelectWithSearch<AgentItem>
        items={agentItems}
        onConfirm={handleConfirm}
        renderItem={renderAgentItem}
        renderSelectedItem={renderSelectedAgentItem}
        // Number of terminal lines allocated per item to render
        itemLines={4}
        // Number of lines of room that we need to render the search
        legRoom={7}
        searchPrompt="Search Agents:"
        selectPrompt="Select Agents"
      />
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
