import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import type { AnalyticsEntityFilter } from "@app/components/workspace/analytics/analyticsFilter";
import { CreditsTableCard } from "@app/components/workspace/analytics/CreditsTableCard";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import {
  AvatarNameCell,
  CreditsCell,
  EntityList,
} from "@app/components/workspace/analytics/creditsTableCells";
import { useDebounce } from "@app/hooks/useDebounce";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import type {
  UserCreditAgent,
  UserCreditRow,
} from "@app/lib/api/assistant/observability/user_credits";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useWorkspaceUserCredits } from "@app/lib/swr/workspaces";
import { isAdmin } from "@app/types/user";
import { Avatar, DataTable, Hoverable, Tooltip } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

interface UserCreditRowData extends UserCreditRow {
  onClick?: () => void;
  onDoubleClick?: () => void;
  onAgentClick?: (agentId: string) => void;
}

type UserCreditInfo = CellContext<UserCreditRowData, unknown>;

interface TopAgentsCellProps {
  agents: UserCreditAgent[];
  onAgentClick?: (agentId: string) => void;
}

function TopAgentsCell({ agents, onAgentClick }: TopAgentsCellProps) {
  return (
    <EntityList
      items={agents}
      renderItem={(agent) => {
        const label = (
          <div className="flex items-center gap-1.5">
            <Avatar
              name={agent.name}
              visual={agent.pictureUrl ?? undefined}
              size="xs"
            />
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-sm">{agent.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {agent.modelDisplayName}
              </span>
            </span>
          </div>
        );
        const row = onAgentClick ? (
          <Hoverable
            variant="primary"
            className="flex min-w-0 items-center text-left"
            onClick={(e) => {
              e.stopPropagation();
              onAgentClick(agent.agentId);
            }}
          >
            {label}
          </Hoverable>
        ) : (
          label
        );
        return agent.description ? (
          <Tooltip
            key={agent.agentId}
            label={agent.description}
            trigger={row}
            tooltipTriggerAsChild
          />
        ) : (
          <div key={agent.agentId}>{row}</div>
        );
      }}
    />
  );
}

const columns: ColumnDef<UserCreditRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "User",
    meta: { sizeRatio: 30 },
    cell: (info: UserCreditInfo) => (
      <DataTable.CellContent>
        <AvatarNameCell
          name={info.row.original.name}
          imageUrl={info.row.original.imageUrl}
          isRounded
        />
      </DataTable.CellContent>
    ),
  },
  {
    id: "messageCount",
    accessorKey: "messageCount",
    header: "Messages",
    meta: { sizeRatio: 13 },
    cell: (info: UserCreditInfo) => (
      <DataTable.BasicCellContent
        label={info.row.original.messageCount.toLocaleString()}
      />
    ),
  },
  {
    id: "credits",
    accessorKey: "credits",
    header: "Credits",
    meta: { sizeRatio: 13 },
    cell: (info: UserCreditInfo) => (
      <DataTable.CellContent>
        <CreditsCell
          credits={info.row.original.credits}
          messageCount={info.row.original.messageCount}
        />
      </DataTable.CellContent>
    ),
  },
  {
    id: "topAgents",
    header: "Top agents",
    meta: { sizeRatio: 44 },
    cell: (info: UserCreditInfo) => (
      <DataTable.CellContent>
        <TopAgentsCell
          agents={info.row.original.topAgents}
          onAgentClick={info.row.original.onAgentClick}
        />
      </DataTable.CellContent>
    ),
  },
];

interface WorkspaceUserCreditsTableProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
  onSelectUser?: (filter: AnalyticsEntityFilter) => void;
}

export function WorkspaceUserCreditsTable({
  workspaceId,
  period,
  onSelectUser,
}: WorkspaceUserCreditsTableProps) {
  const { user, workspace } = useAuth();
  const [detailedAgentId, setDetailedAgentId] = useState<string | null>(null);
  const canOpenAgentDetails = isAdmin(workspace);

  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: 300,
  });

  const { userCredits, isUserCreditsLoading, isUserCreditsError } =
    useWorkspaceUserCredits({
      workspaceId,
      days: period,
      limit: 100,
      search: debouncedValue || undefined,
      disabled: !workspaceId,
    });

  const rows: UserCreditRowData[] = userCredits.map((row) => ({
    ...row,
    ...(canOpenAgentDetails
      ? { onAgentClick: (agentId: string) => setDetailedAgentId(agentId) }
      : {}),
    ...(onSelectUser
      ? { onClick: () => onSelectUser({ id: row.userId, name: row.name }) }
      : {}),
  }));

  const exportParams = new URLSearchParams({
    days: period.toString(),
    limit: "100",
    format: "csv",
  });
  if (debouncedValue) {
    exportParams.set("search", debouncedValue);
  }
  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/user-credits?${exportParams.toString()}`,
    filename: `dust_users_by_credits_last_${period}_days.csv`,
    disabled:
      isUserCreditsLoading ||
      Boolean(isUserCreditsError) ||
      userCredits.length === 0,
  });

  return (
    <>
      {canOpenAgentDetails && (
        <AgentDetailsSheet
          owner={workspace}
          user={user}
          agentId={detailedAgentId}
          onClose={() => setDetailedAgentId(null)}
        />
      )}
      <CreditsTableCard<UserCreditRowData>
        actions={<CsvDownloadButton {...csvDownload} />}
        title="Users by credits"
        description={`Top 100 users by credits over the last ${period} days, with their most-used agents.`}
        searchName="user-credits-search"
        searchPlaceholder="Search a user…"
        searchValue={inputValue}
        onSearchChange={setValue}
        isLoading={isUserCreditsLoading}
        isError={Boolean(isUserCreditsError)}
        errorMessage="Failed to load user credits."
        emptyMessage={
          debouncedValue
            ? `No user matches "${inputValue}".`
            : "No user activity for this selection."
        }
        columns={columns}
        data={rows}
      />
    </>
  );
}
