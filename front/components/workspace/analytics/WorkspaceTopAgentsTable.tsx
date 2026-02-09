import { DataTable, ScrollableDataTable, Spinner } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { LinkWrapper } from "@app/lib/platform";
import { useWorkspaceTopAgents } from "@app/lib/swr/workspaces";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import { isGlobalAgentId } from "@app/types";

interface TopAgentRowData {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  messageCount: number;
  userCount: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

type TopAgentInfo = CellContext<TopAgentRowData, unknown>;

function makeColumns(workspaceId: string): ColumnDef<TopAgentRowData>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Agent",
      cell: (info: TopAgentInfo) => {
        const { agentId, name, pictureUrl } = info.row.original;
        const isCustomAgent = !isGlobalAgentId(agentId);

        return (
          <DataTable.CellContent avatarUrl={pictureUrl ?? undefined}>
            {isCustomAgent ? (
              <LinkWrapper
                href={getAgentBuilderRoute(workspaceId, agentId)}
                className="hover:underline"
              >
                {name}
              </LinkWrapper>
            ) : (
              name
            )}
          </DataTable.CellContent>
        );
      },
      meta: {
        sizeRatio: 70,
      },
    },
    {
      id: "messageCount",
      accessorKey: "messageCount",
      header: "Messages",
      meta: {
        sizeRatio: 15,
      },
      cell: (info: TopAgentInfo) => (
        <DataTable.BasicCellContent
          className="text-center"
          label={`${info.row.original.messageCount}`}
        />
      ),
    },
    {
      id: "userCount",
      accessorKey: "userCount",
      header: "Users",
      meta: {
        sizeRatio: 15,
      },
      cell: (info: TopAgentInfo) => (
        <DataTable.BasicCellContent label={`${info.row.original.userCount}`} />
      ),
    },
  ];
}

interface WorkspaceTopAgentsTableProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceTopAgentsTable({
  workspaceId,
  period,
}: WorkspaceTopAgentsTableProps) {
  const { topAgents, isTopAgentsLoading, isTopAgentsError } =
    useWorkspaceTopAgents({
      workspaceId,
      days: period,
      limit: 100,
      disabled: !workspaceId,
    });

  const columns = makeColumns(workspaceId);

  const rows = useMemo<TopAgentRowData[]>(() => {
    return topAgents.map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      pictureUrl: agent.pictureUrl,
      messageCount: agent.messageCount,
      userCount: agent.userCount,
    }));
  }, [topAgents]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 dark:border-border-night">
      <div className="mb-3">
        <h3 className="text-base font-medium text-foreground dark:text-foreground-night">
          Top agents
        </h3>
        <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
          Top 100 agents with the most messages over the last {period} days.
        </p>
      </div>
      {isTopAgentsLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : isTopAgentsError ? (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Failed to load top agents.
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No agent activity for this selection.
        </div>
      ) : (
        <ScrollableDataTable<TopAgentRowData>
          data={rows}
          columns={columns}
          maxHeight="max-h-64"
        />
      )}
    </div>
  );
}
