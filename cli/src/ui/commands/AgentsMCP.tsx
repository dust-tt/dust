import React, { FC, ReactNode, useCallback, useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import { getDustClient } from "../../utils/dustClient.js";
import AuthService from "../../utils/authService.js";
import { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import {
  MultiSelectWithSearch,
  BaseItem,
} from "../components/MultiSelectWithSearch.js";
import { startMcpServer } from "../../utils/mcpServer.js";
import os from "os";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const ifaceArr = interfaces[name];
    if (ifaceArr) {
      for (const iface of ifaceArr) {
        if (iface.family === "IPv4" && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
  }
  return ips;
}

interface AgentItem extends BaseItem {
  description: string;
  scope?: string;
  userFavorite?: boolean;
}

const AgentsMCP: FC = () => {
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

  const { stdout } = useStdout();

  useEffect(() => {
    const fetchAgents = async () => {
      setIsLoading(true);
      setError(null);
      try {
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
        if (agentsRes.isOk()) {
          const sortedAgents: AgentConfiguration[] = [];
          const addedAgentIds = new Set<string>();
          const addAgentOnce = (agent: AgentConfiguration) => {
            if (!addedAgentIds.has(agent.sId)) {
              sortedAgents.push(agent);
              addedAgentIds.add(agent.sId);
            }
          };
          for (const agent of agentsRes.value) {
            if (agent.userFavorite) addAgentOnce(agent);
          }
          for (const agent of agentsRes.value) {
            if (agent.scope === "workspace") addAgentOnce(agent);
          }
          for (const agent of agentsRes.value) {
            if (agent.scope === "published") addAgentOnce(agent);
          }
          for (const agent of agentsRes.value) {
            if (agent.scope !== "global") addAgentOnce(agent);
          }
          for (const agent of agentsRes.value) addAgentOnce(agent);
          setAllAgents(sortedAgents);
        } else {
          setError(`API Error: ${agentsRes.error.message}`);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAgents();
  }, []);

  const agentItems: AgentItem[] = allAgents.map((agent) => ({
    id: agent.sId,
    label: agent.name,
    description: agent.description,
  }));

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

  useEffect(() => {
    if (confirmedSelection && currentWorkspaceId && !isServerStarted) {
      const selectedAgentObjects = allAgents.filter((agent) =>
        confirmedSelection.includes(agent.sId)
      );
      startMcpServer(selectedAgentObjects, currentWorkspaceId, (url) => {
        setIsServerStarted(true);
        setServerUrl(url);
      });
    }
  }, [confirmedSelection, currentWorkspaceId, allAgents, isServerStarted]);

  if (confirmedSelection) {
    if (!isServerStarted) {
      const orderedSelectedAgents = confirmedSelection
        .map((id) => allAgents.find((agent) => agent.sId === id))
        .filter((agent): agent is AgentConfiguration => agent !== undefined);
      return (
        <Box flexDirection="column">
          <Text>Selected Agents:</Text>
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
              <Spinner type="dots" /> Starting MCP Server...
            </Text>
          </Box>
        </Box>
      );
    } else {
      const localIPs = getLocalIPs();
      const port = serverUrl ? new URL(serverUrl).port : "";

      return (
        <Box flexDirection="column" alignItems="flex-start">
          <Text color="green">MCP Server running.</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>Listening at:</Text>
            <Text color="blueBright" underline>
              http://localhost:{port}/sse
            </Text>
            {localIPs.map((ip) => (
              <Text key={ip} color="blueBright" underline>
                http://{ip}:{port}/sse
              </Text>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color="gray">
              Use MCP client to interact (Ctrl+C to stop).
            </Text>
          </Box>
        </Box>
      );
    }
  }

  return (
    <MultiSelectWithSearch<AgentItem>
      items={agentItems}
      isLoading={isLoading}
      error={error}
      onConfirm={handleConfirm}
      renderItem={renderAgentItem}
      renderSelectedItem={renderSelectedAgentItem}
      itemLines={4}
      legRoom={7}
      searchPrompt="Search Agents:"
      selectPrompt="Select Agents"
    />
  );
};

export default AgentsMCP;
