import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { CreditsTableCard } from "@app/components/workspace/analytics/CreditsTableCard";
import {
  AvatarNameCell,
  CreditsCell,
  EntityList,
} from "@app/components/workspace/analytics/creditsTableCells";
import { useDebounce } from "@app/hooks/useDebounce";
import type {
  UserCreditAgent,
  UserCreditRow,
} from "@app/lib/api/assistant/observability/user_credits";
import { useWorkspaceUserCredits } from "@app/lib/swr/workspaces";
import { Avatar, DataTable, Tooltip } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

interface UserCreditRowData extends UserCreditRow {
  onClick?: () => void;
  onDoubleClick?: () => void;
}

type UserCreditInfo = CellContext<UserCreditRowData, unknown>;

function TopAgentsCell({ agents }: { agents: UserCreditAgent[] }) {
  return (
    <EntityList
      items={agents}
      renderItem={(agent) => {
        const row = (
          <div className="flex items-center gap-1.5">
            <Avatar
              name={agent.name}
              visual={agent.pictureUrl ?? undefined}
              size="xs"
              isRounded
            />
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-sm">{agent.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground dark:text-muted-foreground-night">
                {agent.modelDisplayName}
              </span>
            </span>
          </div>
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
        <CreditsCell credits={info.row.original.credits} />
      </DataTable.CellContent>
    ),
  },
  {
    id: "topAgents",
    header: "Top agents",
    meta: { sizeRatio: 44 },
    cell: (info: UserCreditInfo) => (
      <DataTable.CellContent>
        <TopAgentsCell agents={info.row.original.topAgents} />
      </DataTable.CellContent>
    ),
  },
];

interface WorkspaceUserCreditsTableProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceUserCreditsTable({
  workspaceId,
  period,
}: WorkspaceUserCreditsTableProps) {
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

  return (
    <CreditsTableCard<UserCreditRowData>
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
      data={userCredits}
    />
  );
}
