import React, { FC, ReactNode, useCallback, useEffect } from "react";
import { useAgents } from "../../utils/hooks/use_agents.js";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import { BaseItem, SelectWithSearch } from "./SelectWithSearch.js";
import { GetAgentConfigurationsResponseType } from "@dust-tt/client";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface AgentItem extends BaseItem {
  description: string;
  scope?: string;
  userFavorite?: boolean;
}

interface AgentSelectorProps {
  requestedSIds?: string[];
  selectMultiple?: boolean;
  onError: (error: string) => void;
  onConfirm: (agents: AgentConfiguration[]) => void;
}

const AgentSelector: FC<AgentSelectorProps> = ({
  requestedSIds = [],
  onError,
  onConfirm,
}) => {
  const { stdout } = useStdout();

  const {
    allAgents,
    error: agentsError,
    isLoading: agentsIsLoading,
  } = useAgents();

  useEffect(() => {
    if (agentsError) {
      onError?.(agentsError);
    }
  }, [agentsError, onError]);

  useEffect(() => {
    if (!allAgents?.length || requestedSIds.length === 0) {
      return;
    }

    const requestedAgents: AgentConfiguration[] = [];
    for (const sId of requestedSIds) {
      const agent = allAgents.find((agent) => agent.sId === sId);
      if (agent) {
        requestedAgents.push(agent);
      } else {
        onError(`Agent with sId ${sId} not found`);
        return;
      }
    }

    onConfirm(requestedAgents);
  }, [allAgents, requestedSIds, onError, onConfirm]);

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

  const handleConfirm = useCallback(
    (selectedIds: string[]) => {
      const selectedAgents = allAgents.filter((agent) =>
        selectedIds.includes(agent.sId)
      );
      onConfirm(selectedAgents);
    },
    [allAgents, onConfirm]
  );

  if (agentsError) {
    return null;
  }

  if (agentsIsLoading) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" /> Loading agents...
        </Text>
      </Box>
    );
  }

  if (requestedSIds?.length > 0) {
    return null;
  }

  const agentItems: AgentItem[] = allAgents.map((agent) => ({
    id: agent.sId,
    label: agent.name,
    description: agent.description,
  }));

  return (
    <SelectWithSearch<AgentItem>
      items={agentItems}
      onConfirm={handleConfirm}
      renderItem={renderAgentItem}
      renderSelectedItem={renderSelectedAgentItem}
      itemLines={4}
      legRoom={7}
      searchPrompt="Search Agents:"
      selectPrompt="Select an Agent"
    />
  );
};

export default AgentSelector;
