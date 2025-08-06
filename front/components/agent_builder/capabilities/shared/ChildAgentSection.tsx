import {
  ContentMessage,
  createRadioSelectionColumn,
  DataTable,
  InformationCircleIcon,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (field.value) {
      const selectedIndex = agentConfigurations.findIndex(
        (agent) => agent.sId === field.value
      );
      if (selectedIndex >= 0) {
        setRowSelection({ [selectedIndex]: true });
      } else {
        setRowSelection({});
      }
    } else {
      setRowSelection({});
    }
  }, [field.value, agentConfigurations]);

  const handleRowSelectionChange = useCallback(
    (newSelection: RowSelectionState) => {
      setRowSelection(newSelection);
      const selectedIndex = Object.keys(newSelection)[0];
      const selectedAgent = agentConfigurations[parseInt(selectedIndex, 10)];
      if (selectedAgent) {
        field.onChange(selectedAgent.sId);
      }
    },
    [agentConfigurations, field]
  );

  const tableData: AgentTableData[] = useMemo(
    () => agentConfigurations.map((agent) => ({ ...agent })),
    [agentConfigurations]
  );

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

  const renderContent = () => {
    if (isAgentConfigurationsLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      );
    }

    const selectedAgent = agentConfigurations.find(
      (agent) => agent.sId === field.value
    );

    if (
      !isAgentConfigurationsError &&
      agentConfigurations.length > 0 &&
      (!field.value || selectedAgent)
    ) {
      return (
        <div className="flex flex-col">
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
        </div>
      );
    }

    let messageProps: {
      title: string;
      children: string;
    };

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
      <ContentMessage
        title={messageProps.title}
        icon={InformationCircleIcon}
        variant="warning"
        size="sm"
      >
        {messageProps.children}
      </ContentMessage>
    );
  };

  return (
    <ConfigurationSectionContainer
      title="Select Agent"
      error={fieldState.error?.message}
    >
      {renderContent()}
    </ConfigurationSectionContainer>
  );
}
