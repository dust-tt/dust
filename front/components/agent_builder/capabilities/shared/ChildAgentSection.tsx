import {
  ContentMessage,
  DataTable,
  InformationCircleIcon,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types";

interface AgentTableData extends LightAgentConfigurationType {
  onClick: () => void;
}

interface AgentSelectionTableProps {
  tableData: AgentTableData[];
  columns: ColumnDef<AgentTableData>[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

function AgentSelectionTable({
  tableData,
  columns,
  searchQuery,
  setSearchQuery,
}: AgentSelectionTableProps) {
  return (
    <>
      <SearchInput
        name="search"
        placeholder="Search"
        value={searchQuery}
        onChange={setSearchQuery}
      />
      <DataTable
        data={tableData}
        columns={columns}
        filter={searchQuery}
        filterColumn="name"
        sorting={[{ id: "name", desc: false }]}
        enableSortingRemoval={false}
      />
    </>
  );
}

interface AgentMessageProps {
  title: string;
  children: string;
}

function AgentMessage({ title, children }: AgentMessageProps) {
  return (
    <ContentMessage
      title={title}
      icon={InformationCircleIcon}
      variant="warning"
      size="sm"
    >
      {children}
    </ContentMessage>
  );
}

export function ChildAgentSection({ onSelected }: { onSelected?: () => void }) {
  const { owner } = useAgentBuilderContext();
  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.childAgentId"
  >({
    name: "configuration.childAgentId",
  });

  const {
    agentConfigurations,
    isAgentConfigurationsLoading,
    isAgentConfigurationsError,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
  });

  const [searchQuery, setSearchQuery] = useState("");

  const handleRowClick = (agent: LightAgentConfigurationType) => {
    field.onChange(agent.sId);
    onSelected?.();
  };

  const tableData: AgentTableData[] = agentConfigurations.map((agent) => ({
    ...agent,
    onClick: () => handleRowClick(agent),
  }));

  const columns: ColumnDef<AgentTableData>[] = useMemo(
    () => [
      {
        id: "name",
        accessorKey: "name",
        cell: ({ row }) => (
          <DataTable.CellContent avatarUrl={row.original.pictureUrl}>
            <div className="flex flex-col py-1">
              <div className="heading-sm truncate font-medium">
                {row.original.name}
              </div>
              <div className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
                {row.original.description || "No description available"}
              </div>
            </div>
          </DataTable.CellContent>
        ),
        enableSortingRemoval: false,
        meta: {
          sizeRatio: 100,
        },
      },
    ],
    []
  );

  const selectedAgent = agentConfigurations.find(
    (agent) => agent.sId === field.value
  );

  let messageProps: { title: string; children: string };
  if (isAgentConfigurationsError) {
    messageProps = {
      title: "Error loading agents",
      children: "Failed to load available agents. Please try again later.",
    };
  } else if (agentConfigurations.length === 0) {
    messageProps = {
      title: "No agents available",
      children:
        "There are no agents available to select. Please create an agent first.",
    };
  } else {
    messageProps = {
      title: "The agent selected is not available to you",
      children: `The agent (${field.value}) selected is not available to you, either because it was archived or because you have lost access to it (based on a restricted space you're not a part of). As an editor you can still remove the Run Agent tool to add a new one pointing to another agent.`,
    };
  }

  return (
    <ConfigurationSectionContainer
      title="Select Agent"
      error={fieldState.error?.message}
    >
      {isAgentConfigurationsLoading && (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      )}

      {!isAgentConfigurationsLoading && (
        <AgentSelectionTable
          tableData={tableData}
          columns={columns}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {!isAgentConfigurationsLoading && !selectedAgent && (
        <AgentMessage {...messageProps} />
      )}
    </ConfigurationSectionContainer>
  );
}
