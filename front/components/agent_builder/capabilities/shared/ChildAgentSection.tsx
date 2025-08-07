import {
  ContentMessage,
  createRadioSelectionColumn,
  DataTable,
  InformationCircleIcon,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import React, { useMemo, useState } from "react";
import { useController } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

interface AgentTableData extends LightAgentConfigurationType {
  onClick?: () => void;
}

interface AgentSelectionTableProps {
  tableData: AgentTableData[];
  columns: ColumnDef<AgentTableData>[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  rowSelection: RowSelectionState;
  handleRowSelectionChange: (newSelection: RowSelectionState) => void;
}

function AgentSelectionTable({
  tableData,
  columns,
  searchQuery,
  setSearchQuery,
  rowSelection,
  handleRowSelectionChange,
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
        enableRowSelection
        enableMultiRowSelection={false}
        rowSelection={rowSelection}
        setRowSelection={handleRowSelectionChange}
        getRowId={(row, index) => index.toString()}
        filter={searchQuery}
        filterColumn="name"
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

interface ChildAgentSectionProps {
  owner: LightWorkspaceType;
}

export function ChildAgentSection({ owner }: ChildAgentSectionProps) {
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

  const selectedIndex = field.value
    ? agentConfigurations.findIndex((agent) => agent.sId === field.value)
    : null;

  const rowSelection =
    selectedIndex && selectedIndex >= 0 ? { [selectedIndex]: true } : {};

  const handleRowSelectionChange = (newSelection: RowSelectionState) => {
    const selectedIndex = Object.keys(newSelection)[0];
    const selectedAgent = agentConfigurations[parseInt(selectedIndex, 10)];
    if (selectedAgent) {
      field.onChange(selectedAgent.sId);
    }
  };

  const tableData: AgentTableData[] = agentConfigurations.map((agent) => ({
    ...agent,
  }));

  const columns: ColumnDef<AgentTableData>[] = useMemo(
    () => [
      createRadioSelectionColumn<AgentTableData>(),
      {
        id: "name",
        accessorKey: "name",
        cell: ({ row }) => (
          <DataTable.CellContent avatarUrl={row.original.pictureUrl}>
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium">{row.original.name}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
                {row.original.description || "No description available"}
              </div>
            </div>
          </DataTable.CellContent>
        ),
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

  const shouldShowTable =
    !isAgentConfigurationsError &&
    agentConfigurations.length > 0 &&
    (!field.value || selectedAgent);

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

      {!isAgentConfigurationsLoading && shouldShowTable && (
        <AgentSelectionTable
          tableData={tableData}
          columns={columns}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          rowSelection={rowSelection}
          handleRowSelectionChange={handleRowSelectionChange}
        />
      )}

      {!isAgentConfigurationsLoading && !shouldShowTable && (
        <AgentMessage {...messageProps} />
      )}
    </ConfigurationSectionContainer>
  );
}
