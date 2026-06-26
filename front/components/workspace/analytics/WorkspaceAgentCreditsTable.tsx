import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { CreditsTableCard } from "@app/components/workspace/analytics/CreditsTableCard";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import {
  AvatarNameCell,
  CreditsCell,
  EmptyCell,
  EntityList,
} from "@app/components/workspace/analytics/creditsTableCells";
import { useDebounce } from "@app/hooks/useDebounce";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import type {
  AgentCreditRow,
  AgentCreditSkill,
  AgentCreditUser,
} from "@app/lib/api/assistant/observability/agent_credits";
import { useWorkspaceAgentCredits } from "@app/lib/swr/workspaces";
import { DataTable, Tooltip } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

interface AgentCreditRowData extends AgentCreditRow {
  onClick?: () => void;
  onDoubleClick?: () => void;
}

type AgentCreditInfo = CellContext<AgentCreditRowData, unknown>;

function TopUsersCell({ users }: { users: AgentCreditUser[] }) {
  return (
    <EntityList
      items={users}
      renderItem={(user) => (
        <AvatarNameCell
          key={user.userId}
          name={user.name}
          imageUrl={user.imageUrl}
        />
      )}
    />
  );
}

function TopSkillsCell({ skills }: { skills: AgentCreditSkill[] }) {
  return (
    <EntityList
      items={skills}
      renderItem={(skill) => {
        const label = <span className="truncate text-sm">{skill.name}</span>;
        return skill.description ? (
          <Tooltip
            key={skill.skillId}
            label={skill.description}
            tooltipTriggerAsChild
            trigger={label}
          />
        ) : (
          <span key={skill.skillId} className="truncate text-sm">
            {skill.name}
          </span>
        );
      }}
    />
  );
}

const columns: ColumnDef<AgentCreditRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Agent",
    meta: { sizeRatio: 16 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.CellContent>
        <AvatarNameCell
          name={info.row.original.name}
          imageUrl={info.row.original.pictureUrl}
        />
      </DataTable.CellContent>
    ),
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
        return <EmptyCell />;
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
        <CreditsCell credits={info.row.original.credits} />
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

  const exportParams = new URLSearchParams({
    days: period.toString(),
    limit: "100",
    format: "csv",
  });
  if (debouncedValue) {
    exportParams.set("search", debouncedValue);
  }
  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/agent-credits?${exportParams.toString()}`,
    filename: `dust_agents_by_credits_last_${period}_days.csv`,
    disabled:
      isAgentCreditsLoading ||
      Boolean(isAgentCreditsError) ||
      agentCredits.length === 0,
  });

  return (
    <CreditsTableCard<AgentCreditRowData>
      actions={<CsvDownloadButton {...csvDownload} />}
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
