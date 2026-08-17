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
  AgentCreditRow,
  AgentCreditSkill,
  AgentCreditUser,
} from "@app/lib/api/assistant/observability/agent_credits";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useWorkspaceAgentCredits } from "@app/lib/swr/workspaces";
import { DataTable, Hoverable, Tooltip } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

interface AgentCreditRowData extends AgentCreditRow {
  onClick?: () => void;
  onDoubleClick?: () => void;
  onNameClick?: () => void;
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
          isRounded
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
    meta: { sizeRatio: 18 },
    cell: (info: AgentCreditInfo) => {
      const { name, pictureUrl, onNameClick } = info.row.original;
      const content = <AvatarNameCell name={name} imageUrl={pictureUrl} />;
      return (
        <DataTable.CellContent>
          {onNameClick ? (
            <Hoverable
              variant="primary"
              className="flex min-w-0 items-center text-left"
              onClick={(e) => {
                // Open the agent details sheet without also triggering the
                // row-level chart-scope toggle.
                e.stopPropagation();
                onNameClick();
              }}
            >
              {content}
            </Hoverable>
          ) : (
            content
          )}
        </DataTable.CellContent>
      );
    },
  },
  {
    id: "modelDisplayName",
    accessorKey: "modelDisplayName",
    header: "Model",
    meta: { sizeRatio: 12 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.BasicCellContent label={info.row.original.modelDisplayName} />
    ),
  },
  {
    id: "messageCount",
    accessorKey: "messageCount",
    header: "Messages",
    meta: { sizeRatio: 10 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.BasicCellContent
        label={info.row.original.messageCount.toLocaleString()}
      />
    ),
  },
  {
    id: "credits",
    accessorKey: "credits",
    header: "Credits",
    meta: { sizeRatio: 10 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.CellContent>
        <CreditsCell
          credits={info.row.original.credits}
          messageCount={info.row.original.messageCount}
        />
      </DataTable.CellContent>
    ),
  },
  {
    id: "topUsers",
    header: "Top users",
    meta: { sizeRatio: 26 },
    cell: (info: AgentCreditInfo) => (
      <DataTable.CellContent>
        <TopUsersCell users={info.row.original.topUsers} />
      </DataTable.CellContent>
    ),
  },
  {
    id: "topSkills",
    header: "Top skills",
    meta: { sizeRatio: 24 },
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
  onSelectAgent?: (filter: AnalyticsEntityFilter) => void;
}

export function WorkspaceAgentCreditsTable({
  workspaceId,
  period,
  onSelectAgent,
}: WorkspaceAgentCreditsTableProps) {
  const { user, workspace } = useAuth();
  const [detailedAgentId, setDetailedAgentId] = useState<string | null>(null);

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

  const rows: AgentCreditRowData[] = agentCredits.map((row) => ({
    ...row,
    onNameClick: () => setDetailedAgentId(row.agentId),
    ...(onSelectAgent
      ? { onClick: () => onSelectAgent({ id: row.agentId, name: row.name }) }
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
    url: `/api/w/${workspaceId}/analytics/agent-credits?${exportParams.toString()}`,
    filename: `dust_agents_by_credits_last_${period}_days.csv`,
    disabled:
      isAgentCreditsLoading ||
      Boolean(isAgentCreditsError) ||
      agentCredits.length === 0,
  });

  return (
    <>
      <AgentDetailsSheet
        owner={workspace}
        user={user}
        agentId={detailedAgentId}
        onClose={() => setDetailedAgentId(null)}
      />
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
        data={rows}
      />
    </>
  );
}
