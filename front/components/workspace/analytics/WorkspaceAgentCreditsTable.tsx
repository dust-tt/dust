import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { CreditsTableCard } from "@app/components/workspace/analytics/CreditsTableCard";
import { useDebounce } from "@app/hooks/useDebounce";
import type {
  AgentCreditRow,
  AgentCreditSkill,
  AgentCreditUser,
} from "@app/lib/api/assistant/observability/agent_credits";
import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import { useWorkspaceAgentCredits } from "@app/lib/swr/workspaces";
import { Avatar, DataTable, Tooltip } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

interface AgentCreditRowData extends AgentCreditRow {
  onClick?: () => void;
  onDoubleClick?: () => void;
}

type AgentCreditInfo = CellContext<AgentCreditRowData, unknown>;

function TopUsersCell({ users }: { users: AgentCreditUser[] }) {
  if (users.length === 0) {
    return (
      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
        —
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-2 py-1">
      {users.slice(0, 3).map((user) => (
        <div key={user.userId} className="flex items-center gap-1.5">
          <Avatar
            name={user.name}
            visual={user.imageUrl ?? undefined}
            size="xs"
            isRounded
          />
          <span className="truncate text-sm">{user.name}</span>
        </div>
      ))}
    </div>
  );
}

function TopSkillsCell({ skills }: { skills: AgentCreditSkill[] }) {
  if (skills.length === 0) {
    return (
      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
        —
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-2 py-1">
      {skills.slice(0, 3).map((skill, index) => {
        const label = <span className="truncate text-sm">{skill.name}</span>;
        return skill.description ? (
          <Tooltip
            key={`${skill.name}-${index}`}
            label={skill.description}
            tooltipTriggerAsChild
            trigger={label}
          />
        ) : (
          <span key={`${skill.name}-${index}`} className="truncate text-sm">
            {skill.name}
          </span>
        );
      })}
    </div>
  );
}

const columns: ColumnDef<AgentCreditRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Agent",
    meta: { sizeRatio: 16 },
    cell: (info: AgentCreditInfo) => {
      const { name, pictureUrl } = info.row.original;
      return (
        <DataTable.CellContent>
          <div className="flex items-center gap-2">
            <Avatar
              name={name}
              visual={pictureUrl ?? undefined}
              size="xs"
              isRounded
            />
            <span className="truncate text-sm">{name}</span>
          </div>
        </DataTable.CellContent>
      );
    },
  },
  {
    id: "modelDisplayName",
    accessorKey: "modelDisplayName",
    header: "Model",
    meta: { sizeRatio: 11 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.BasicCellContent label={info.row.original.modelDisplayName} />
    ),
  },
  {
    id: "description",
    header: "Description",
    meta: { sizeRatio: 20 },
    cell: (info: AgentCreditInfo) => {
      const { description } = info.row.original;
      if (!description) {
        return (
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            —
          </span>
        );
      }
      return (
        <DataTable.CellContent>
          <Tooltip
            label={description}
            tooltipTriggerAsChild
            trigger={
              <span className="line-clamp-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                {description}
              </span>
            }
          />
        </DataTable.CellContent>
      );
    },
  },
  {
    id: "credits",
    accessorKey: "credits",
    header: "Credits",
    meta: { sizeRatio: 8 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.CellContent>
        <Tooltip
          label={`${formatCredits(info.row.original.credits)} credits`}
          tooltipTriggerAsChild
          trigger={
            <span className="text-sm">
              {formatCreditsCompact(info.row.original.credits)}
            </span>
          }
        />
      </DataTable.CellContent>
    ),
  },
  {
    id: "topUsers",
    header: "Top users",
    meta: { sizeRatio: 23 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.CellContent>
        <TopUsersCell users={info.row.original.topUsers} />
      </DataTable.CellContent>
    ),
  },
  {
    id: "topSkills",
    header: "Top skills",
    meta: { sizeRatio: 22 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.CellContent>
        <TopSkillsCell skills={info.row.original.topSkills} />
      </DataTable.CellContent>
    ),
  },
];

interface WorkspaceAgentCreditsTableProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceAgentCreditsTable({
  workspaceId,
  period,
}: WorkspaceAgentCreditsTableProps) {
  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: 300,
  });

  const { agentCredits, isAgentCreditsLoading, isAgentCreditsError } =
    useWorkspaceAgentCredits({
      workspaceId,
      days: period,
      limit: 100,
      search: debouncedValue || undefined,
      disabled: !workspaceId,
    });

  return (
    <CreditsTableCard<AgentCreditRowData>
      title="Agents by credits"
      description={`Top 100 agents by credits over the last ${period} days, with their top users and skills.`}
      searchName="agent-credits-search"
      searchPlaceholder="Search an agent…"
      searchValue={inputValue}
      onSearchChange={setValue}
      isLoading={isAgentCreditsLoading}
      isError={Boolean(isAgentCreditsError)}
      errorMessage="Failed to load agent credits."
      emptyMessage={
        debouncedValue
          ? `No agent matches "${inputValue}".`
          : "No agent activity for this selection."
      }
      columns={columns}
      data={agentCredits}
    />
  );
}
