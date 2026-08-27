import { ConfirmContext } from "@app/components/Confirm";
import { AllowSlackWorkflowDialog } from "@app/components/workspace/analytics/automations/AllowSlackWorkflowDialog";
import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useDebounce } from "@app/hooks/useDebounce";
import { useSlackWorkflowsOverview } from "@app/hooks/useSlackWorkflowsOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";
import {
  useRevokeSlackWorkflow,
  useSlackWorkflows,
} from "@app/lib/swr/slack_workflows";
import { timeAgoFrom } from "@app/lib/utils";
import type { SlackWorkflowType } from "@app/types/api/slack/workflows";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DataTable,
  DataTableLoadingSkeleton,
  LoadingBlock,
  Plus,
  SearchInput,
  Tooltip,
  Trash01,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useCallback, useContext, useMemo, useState } from "react";

const SEARCH_DEBOUNCE_DELAY_MS = 300;
const WORKFLOWS_PAGE_SIZE = 25;

interface SlackWorkflowRowData {
  botName: string;
  spaceNames: string[];
  createdAt: number;
  onClick?: () => void;
}

interface SlackWorkflowsTabProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
}

export function SlackWorkflowsTab({ owner, period }: SlackWorkflowsTabProps) {
  const { workflows, isSlackBotConnected, isWorkflowsLoading } =
    useSlackWorkflows({ owner });

  return (
    <div className="flex flex-col gap-4">
      <SlackWorkflowsOverview
        owner={owner}
        period={period}
        workflowCount={workflows.length}
      />
      <SlackWorkflowsCard
        owner={owner}
        workflows={workflows}
        isSlackBotConnected={isSlackBotConnected}
        isLoading={isWorkflowsLoading}
      />
    </div>
  );
}

interface SlackWorkflowsOverviewProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  workflowCount: number;
}

function SlackWorkflowsOverview({
  owner,
  period,
  workflowCount,
}: SlackWorkflowsOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useSlackWorkflowsOverview({ workspaceId: owner.sId, period });

  if (isOverviewLoading) {
    return <LoadingBlock className="h-24 w-full rounded-xl" />;
  }

  if (isOverviewError || !overview) {
    return null;
  }

  const { slackWorkflowCredits, workspaceTotalCredits } = overview;

  return (
    <div className="flex items-stretch gap-6">
      <SummaryCard
        label="Credits"
        value={formatCredits(slackWorkflowCredits)}
        hint={
          workspaceTotalCredits > 0
            ? `${Math.round((slackWorkflowCredits / workspaceTotalCredits) * 100)}% of workspace consumption`
            : null
        }
      />
      <SummaryCard
        label="Workflows allowed"
        value={workflowCount.toLocaleString()}
        hint={null}
      />
    </div>
  );
}

interface SlackWorkflowsCardProps {
  owner: LightWorkspaceType;
  workflows: SlackWorkflowType[];
  isSlackBotConnected: boolean;
  isLoading: boolean;
}

function SlackWorkflowsCard({
  owner,
  workflows,
  isSlackBotConnected,
  isLoading,
}: SlackWorkflowsCardProps) {
  const confirm = useContext(ConfirmContext);
  const [isAllowDialogOpen, setIsAllowDialogOpen] = useState(false);
  const { doRevokeSlackWorkflow, isRevoking } = useRevokeSlackWorkflow({
    owner,
  });
  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: SEARCH_DEBOUNCE_DELAY_MS,
  });
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: WORKFLOWS_PAGE_SIZE,
  });

  const handleRevoke = useCallback(
    async (botName: string) => {
      const confirmed = await confirm({
        title: "Revoke this Slack workflow?",
        message: `"${botName}" will no longer be able to summon agents from Slack.`,
        validateLabel: "Revoke",
        validateVariant: "warning",
      });

      if (confirmed) {
        await doRevokeSlackWorkflow({ botName });
      }
    },
    [confirm, doRevokeSlackWorkflow]
  );

  const columns: ColumnDef<SlackWorkflowRowData>[] = useMemo(
    () => [
      {
        id: "botName",
        accessorKey: "botName",
        header: "Workflow",
        enableSorting: true,
        meta: { className: "w-64 truncate", headerAlign: "left" },
        cell: (info) => (
          <DataTable.CellContent className="w-full justify-start text-left">
            <span className="truncate text-sm font-semibold">
              {info.row.original.botName}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        id: "spaceNames",
        accessorKey: "spaceNames",
        header: "Spaces",
        enableSorting: false,
        meta: { className: "w-full truncate", headerAlign: "left" },
        cell: (info) => (
          <SpacesCell spaceNames={info.row.original.spaceNames} />
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Added",
        enableSorting: true,
        meta: { className: "w-28", headerAlign: "left" },
        cell: (info) => (
          <DataTable.BasicCellContent
            className="whitespace-nowrap"
            label={`${timeAgoFrom(info.row.original.createdAt, {
              useLongFormat: true,
            })} ago`}
          />
        ),
      },
      {
        id: "revoke",
        header: "",
        enableSorting: false,
        meta: { className: "w-10", headerAlign: "right" },
        cell: (info) => (
          <DataTable.CellContent className="w-full justify-end">
            <div className="transition-opacity duration-150 ease-out motion-reduce:transition-none pointer-fine:opacity-0 pointer-fine:group-hover/dt-row:opacity-100 pointer-fine:focus-within:opacity-100">
              <Button
                icon={Trash01}
                tooltip="Revoke workflow"
                size="xs"
                variant="ghost-secondary"
                disabled={isRevoking}
                onClick={() => void handleRevoke(info.row.original.botName)}
              />
            </div>
          </DataTable.CellContent>
        ),
      },
    ],
    [handleRevoke, isRevoking]
  );

  const rows: SlackWorkflowRowData[] = useMemo(
    () =>
      workflows.map((workflow) => ({
        botName: workflow.botName,
        spaceNames: workflow.spaces.map((space) => space.name),
        createdAt: workflow.createdAt,
      })),
    [workflows]
  );

  return (
    <div className="rounded-lg border border-border bg-panel-background p-4">
      <div className="mb-4 flex items-center gap-2">
        <SearchInput
          name="slack-workflows-search"
          placeholder="Search…"
          value={inputValue}
          onChange={setValue}
          className="flex-1"
        />
        <Button
          label="Allow a workflow"
          variant="outline"
          size="sm"
          icon={Plus}
          onClick={() => setIsAllowDialogOpen(true)}
        />
      </div>
      <SlackWorkflowsTableBody
        columns={columns}
        rows={rows}
        search={debouncedValue}
        isSlackBotConnected={isSlackBotConnected}
        isLoading={isLoading}
        pagination={pagination}
        setPagination={setPagination}
      />
      <AllowSlackWorkflowDialog
        isOpen={isAllowDialogOpen}
        onClose={() => setIsAllowDialogOpen(false)}
        owner={owner}
      />
    </div>
  );
}

interface SlackWorkflowsTableBodyProps {
  columns: ColumnDef<SlackWorkflowRowData>[];
  rows: SlackWorkflowRowData[];
  search: string;
  isSlackBotConnected: boolean;
  isLoading: boolean;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
}

function SlackWorkflowsTableBody({
  columns,
  rows,
  search,
  isSlackBotConnected,
  isLoading,
  pagination,
  setPagination,
}: SlackWorkflowsTableBodyProps) {
  if (isLoading) {
    return (
      <DataTableLoadingSkeleton showSelectionColumn={false} showTrailingCell />
    );
  }

  if (!isSlackBotConnected) {
    return (
      <div className="text-sm text-muted-foreground">
        Connect the Dust Slack bot to let Slack workflows summon agents.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No Slack workflow can summon agents yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <DataTable
        columns={columns}
        data={rows}
        filter={search}
        filterColumn="botName"
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}

function SpacesCell({ spaceNames }: { spaceNames: string[] }) {
  if (spaceNames.length === 0) {
    return <DataTable.BasicCellContent label={GLOBAL_SPACE_NAME} />;
  }

  const label = spaceNames.join(", ");

  return (
    <DataTable.CellContent>
      <Tooltip
        label={label}
        tooltipTriggerAsChild
        trigger={<span className="truncate text-sm">{label}</span>}
      />
    </DataTable.CellContent>
  );
}
