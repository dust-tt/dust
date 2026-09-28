import { SCOPE_INFO } from "@app/components/assistant/details/AgentDetailsSheet";
import { AgentSearchActionsMenu } from "@app/components/assistant/manager/AgentSearchActionsMenu";
import { TableTagSelector } from "@app/components/assistant/manager/TableTagSelector";
import { ModelTierChip } from "@app/components/model_picker/ModelTierChip";
import { getModelMakerLogo } from "@app/components/providers/types";
import {
  SkillEditorsCell,
  SkillLastEditedCell,
} from "@app/components/skills/SkillTableCells";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { useTags } from "@app/lib/swr/tags";
import { tagsSorter } from "@app/lib/utils";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getTieredReasoningEffort } from "@app/types/assistant/models/model_tiers";
import { getModelMaker } from "@app/types/assistant/models/providers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  AvatarCellSkeleton,
  Checkbox,
  Chip,
  ChipCellSkeleton,
  DataTable,
  DataTableSkeleton,
  Label,
  LoadingBlock,
  Spinner,
  TextCellSkeleton,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import capitalize from "lodash/capitalize";
import { useMemo } from "react";

type AgentSearchItem = SearchAgentsResponseBody["agents"][number];

interface AgentSearchTableProps {
  owner: WorkspaceType;
  agents: AgentSearchItem[];
  onSelect: (agentId: string) => void;
  onRefresh: () => void;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  total: number;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  isLoading: boolean;
  selectedAgentIds: string[];
  setSelectedAgentIds: (agentIds: string[]) => void;
  canSelect: (agent: AgentSearchItem) => boolean;
}

type AgentSearchRow = AgentSearchItem & { onClick: () => void };

interface AgentSearchModelCellProps {
  model: AgentSearchItem["model"];
  isDark: boolean;
}

function AgentSearchModelCell({ model, isDark }: AgentSearchModelCellProps) {
  const modelConfig = model ? getSupportedModelConfig(model) : null;
  if (!model || !modelConfig) {
    return <DataTable.BasicCellContent label={model?.modelId ?? "-"} />;
  }
  const modelName = modelConfig.displayName;
  // Surface the reasoning effort the tier resolves at: two agents on the same model can be on
  // different tiers because of it.
  const reasoningEffort = getTieredReasoningEffort(
    modelConfig,
    model.reasoningEffort
  );
  const tooltipLabel =
    reasoningEffort && reasoningEffort !== "none"
      ? `${modelName} ${capitalize(reasoningEffort)}`
      : modelName;

  return (
    <Tooltip
      tooltipTriggerAsChild
      label={tooltipLabel}
      trigger={
        <div className="inline-flex w-full min-w-0">
          <DataTable.CellContent
            className="w-full min-w-0"
            icon={getModelMakerLogo(getModelMaker(modelConfig), isDark)}
            iconClassName="mr-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              {/* Streams are named after their tier: the chip alone carries the info. */}
              {!isModelStreamId(modelConfig.modelId) && (
                <span className="hidden min-w-0 truncate @xl:inline">
                  {modelName}
                </span>
              )}
              <div className="shrink-0">
                <ModelTierChip
                  model={modelConfig}
                  reasoningEffort={model.reasoningEffort}
                />
              </div>
            </div>
          </DataTable.CellContent>
        </div>
      }
    />
  );
}

export function AgentSearchTable({
  owner,
  agents,
  onSelect,
  onRefresh,
  pagination,
  setPagination,
  total,
  sorting,
  setSorting,
  isLoading,
  selectedAgentIds,
  setSelectedAgentIds,
  canSelect,
}: AgentSearchTableProps) {
  const { isDark } = useTheme();
  const { tags, isTagsLoading } = useTags({ owner });
  const sortedTags = useMemo(() => [...tags].sort(tagsSorter), [tags]);
  const columns = useMemo(
    () =>
      [
        {
          id: "select" as const,
          header: ({ table }) => {
            const areAllPageRowsSelected = table.getIsAllPageRowsSelected();
            const hasSelection = Object.values(
              table.getState().rowSelection
            ).some((isSelected) => isSelected);

            return (
              <DataTable.CellContent className="size-full items-center justify-center">
                <Checkbox
                  checked={
                    areAllPageRowsSelected
                      ? true
                      : hasSelection
                        ? "partial"
                        : false
                  }
                  disabled={
                    !table.getRowModel().rows.some((row) => row.getCanSelect())
                  }
                  tooltip={
                    areAllPageRowsSelected
                      ? "Clear selection"
                      : "Select all on page"
                  }
                  onClick={(event) => event.stopPropagation()}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      table.toggleAllPageRowsSelected(true);
                    } else {
                      // Unticking clears the whole selection across pages.
                      table.resetRowSelection();
                    }
                  }}
                />
              </DataTable.CellContent>
            );
          },
          cell: ({ row }) => {
            if (!row.getCanSelect()) {
              return null;
            }
            const checkboxId = `select-agent-${row.id}`;
            return (
              // Keep the click from reaching the row, which opens the agent details.
              <Label
                htmlFor={checkboxId}
                className="flex size-full cursor-pointer items-center justify-center hover:bg-muted-background"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Checkbox
                  id={checkboxId}
                  aria-label={
                    row.getIsSelected()
                      ? `Deselect ${row.original.name}`
                      : `Select ${row.original.name}`
                  }
                  checked={row.getIsSelected()}
                  onCheckedChange={(checked) => row.toggleSelected(!!checked)}
                />
              </Label>
            );
          },
          meta: { className: "w-10 p-0" },
        },
        {
          id: "name" as const,
          accessorKey: "name",
          header: "Name",
          sortDescFirst: false,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <DataTable.CellContent>
              <button type="button" className="w-full min-w-0 text-left">
                <div className="flex flex-row items-center gap-2 py-3">
                  <div>
                    <Avatar visual={agent.pictureUrl} size="sm" />
                  </div>
                  <div className="flex min-w-0 grow flex-col">
                    <div className="heading-sm overflow-hidden truncate text-foreground">
                      {agent.name}
                    </div>
                    <div className="overflow-hidden truncate text-sm text-muted-foreground">
                      {agent.description}
                    </div>
                  </div>
                </div>
              </button>
            </DataTable.CellContent>
          ),
          meta: { className: "w-48 @lg:w-full" },
        },
        {
          id: "model" as const,
          header: "Model",
          cell: ({ row: { original: agent } }) => (
            <AgentSearchModelCell model={agent.model} isDark={isDark} />
          ),
          meta: { className: "hidden @sm:w-28 @sm:table-cell @xl:w-56" },
        },
        {
          id: "access" as const,
          header: "Access",
          cell: ({ row: { original: agent } }) => (
            <DataTable.CellContent>
              {agent.scope !== "hidden" && (
                <Chip
                  size="xs"
                  label={SCOPE_INFO[agent.scope].shortLabel}
                  color={SCOPE_INFO[agent.scope].color}
                  icon={SCOPE_INFO[agent.scope].icon}
                />
              )}
            </DataTable.CellContent>
          ),
          meta: { className: "hidden @lg:w-32 @lg:table-cell" },
        },
        {
          id: "editors" as const,
          header: "Editors",
          cell: ({ row: { original: agent } }) => (
            <SkillEditorsCell
              editors={agent.scope === "global" ? null : agent.editors}
            />
          ),
          meta: { className: "hidden @lg:w-24 @lg:table-cell" },
        },
        {
          id: "tags" as const,
          header: "Tags",
          cell: ({ row: { original: agent } }) => {
            const tagNames = agent.tags.map((tag) => tag.name).join(", ");
            return (
              <DataTable.CellContent
                grow
                className="flex flex-row items-center"
              >
                <div className="group flex flex-row items-center gap-1">
                  <div className="truncate text-muted-foreground">
                    <Tooltip
                      tooltipTriggerAsChild
                      label={tagNames}
                      trigger={<span>{tagNames}</span>}
                    />
                  </div>
                  {canSelect(agent) && isTagsLoading && <Spinner size="xs" />}
                  {canSelect(agent) && !isTagsLoading && (
                    <TableTagSelector
                      tags={sortedTags}
                      agentTags={agent.tags}
                      agentConfigurationId={agent.sId}
                      owner={owner}
                      onChange={async () => onRefresh()}
                    />
                  )}
                </div>
              </DataTable.CellContent>
            );
          },
          meta: { className: "hidden @lg:table-cell @lg:w-24 @xl:w-40" },
        },
        {
          id: "usage" as const,
          accessorKey: "activeUsersCount",
          header: "Usage",
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <DataTable.BasicCellContent
              className="font-mono"
              label={agent.activeUsersCount?.toLocaleString() ?? "-"}
              tooltip={
                agent.activeUsersCount === null
                  ? "Usage is not available for this agent."
                  : "Number of active users in the last 30 days."
              }
            />
          ),
          meta: { className: "hidden @sm:w-24 @sm:table-cell" },
        },
        {
          id: "feedback" as const,
          header: "Feedback",
          cell: ({ row: { original: agent } }) => {
            if (agent.scope === "global") {
              return <DataTable.BasicCellContent label="-" />;
            }
            const { up, down } = agent.feedbacks;
            return (
              <DataTable.BasicCellContent
                className="font-mono"
                label={`${up + down}`}
                tooltip={`${up} positive and ${down} negative feedback${pluralize(up + down)}`}
              />
            );
          },
          meta: { className: "hidden @lg:w-28 @lg:table-cell" },
        },
        {
          id: "updatedAt" as const,
          accessorKey: "updatedAt",
          header: "Last edited",
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <SkillLastEditedCell updatedAt={agent.updatedAt} emptyLabel="-" />
          ),
          meta: { className: "hidden @sm:w-32 @sm:table-cell" },
        },
        {
          id: "actions" as const,
          header: "",
          cell: ({ row: { original: agent } }) =>
            agent.status === "archived" ? null : (
              <AgentSearchActionsMenu
                owner={owner}
                agentId={agent.sId}
                scope={agent.scope}
                onSelect={onSelect}
                onRefresh={onRefresh}
              />
            ),
          meta: { className: "hidden @md:table-cell @md:w-14" },
        },
      ] satisfies ColumnDef<AgentSearchRow>[],
    [canSelect, isDark, isTagsLoading, onRefresh, onSelect, owner, sortedTags]
  );

  // Show skeletons only when no rows are available; keep previous results during refreshes.
  if (isLoading && agents.length === 0) {
    return (
      <div role="status" aria-label="Loading agents">
        <DataTableSkeleton
          columns={columns}
          rowHeight={64}
          SkeletonCell={({ columnId, rowIndex }) => {
            switch (columnId) {
              case "select":
                return <LoadingBlock className="h-4 w-4 rounded-sm" />;
              case "name":
                return (
                  <AvatarCellSkeleton avatarClassName="h-9 w-9 rounded-lg">
                    <TextCellSkeleton
                      className={rowIndex % 2 === 0 ? "h-4 w-32" : "h-4 w-40"}
                    />
                    <TextCellSkeleton className="h-4 w-3/4" />
                  </AvatarCellSkeleton>
                );
              case "model":
                return <TextCellSkeleton className="w-24" />;
              case "access":
                return <ChipCellSkeleton />;
              case "tags":
                return <TextCellSkeleton className="w-16" />;
              case "feedback":
                return <TextCellSkeleton className="w-8" />;
              case "usage":
                return <TextCellSkeleton className="w-8" />;
              case "editors":
                return (
                  <div className="flex -space-x-2">
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                  </div>
                );
              case "updatedAt":
                return <TextCellSkeleton className="w-20" />;
              case "actions":
                return <LoadingBlock className="h-6 w-6 rounded-md" />;
              default:
                assertNeverAndIgnore(columnId);
                return null;
            }
          }}
        />
      </div>
    );
  }

  return (
    <DataTable
      data={agents.map((agent) => ({
        ...agent,
        onClick: () => onSelect(agent.sId),
      }))}
      columns={columns}
      getRowId={(agent) => agent.sId}
      enableRowSelection={(row) => canSelect(row.original)}
      disableRowClickSelection
      rowSelection={Object.fromEntries(
        selectedAgentIds.map((agentId) => [agentId, true])
      )}
      setRowSelection={(rowSelection) =>
        setSelectedAgentIds(
          Object.keys(rowSelection).filter((agentId) => rowSelection[agentId])
        )
      }
      isLoading={isLoading}
      pagination={pagination}
      setPagination={setPagination}
      sorting={sorting}
      setSorting={setSorting}
      isServerSideSorting
      totalRowCount={total}
    />
  );
}
