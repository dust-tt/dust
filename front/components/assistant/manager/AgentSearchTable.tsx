import { SCOPE_INFO } from "@app/components/assistant/details/AgentDetailsSheet";
import { AgentSearchActionsMenu } from "@app/components/assistant/manager/AgentSearchActionsMenu";
import { DefaultAgentToggle } from "@app/components/assistant/manager/DefaultAgentToggle";
import { TableTagSelector } from "@app/components/assistant/manager/TableTagSelector";
import { formatModelEffortLabel } from "@app/components/model_picker/modelPickerUtils";
import { ModelTierChip } from "@app/components/model_picker/ModelTierChip";
import { getModelMakerLogo } from "@app/components/providers/types";
import {
  SkillEditorsCell,
  SkillLastEditedCell,
} from "@app/components/skills/SkillTableCells";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { EntityTooltipCard } from "@app/components/workspace/analytics/creditsTableCells";
import { formatNumber } from "@app/lib/i18n/format";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { useTags } from "@app/lib/swr/tags";
import { tagsSorter } from "@app/lib/utils";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { getTieredReasoningEffort } from "@app/types/assistant/models/model_tiers";
import { getModelMaker } from "@app/types/assistant/models/providers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useMemo } from "react";

type AgentSearchItem = SearchAgentsResponseBody["agents"][number];

const SCOPE_SHORT_LABELS: Record<AgentConfigurationScope, MessageDescriptor> = {
  global: msg({ message: "Default", context: "agent scope" }),
  hidden: msg`Not published`,
  visible: msg`Published`,
};

interface AgentSearchTableProps {
  owner: LightWorkspaceType;
  readOnly?: boolean;
  renderActions?: (agent: AgentSearchItem, onRefresh: () => void) => ReactNode;
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

/**
 * @cc [owner:aubin-tchoi,label:product] compact-model-cell
 * A supported model cell MUST show only the provider icon and tier at every width, while its
 * tooltip retains the model display name and any non-none reasoning effort.
 */
function AgentSearchModelCell({ model, isDark }: AgentSearchModelCellProps) {
  const { t } = useLingui();
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
  const tooltipLabel = formatModelEffortLabel(t, modelName, reasoningEffort);

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

interface AgentSearchTagSelectorProps {
  owner: LightWorkspaceType;
  agent: AgentSearchItem;
  onRefresh: () => void;
}

function AgentSearchTagSelector({
  owner,
  agent,
  onRefresh,
}: AgentSearchTagSelectorProps) {
  const { tags, isTagsLoading } = useTags({ owner });
  const sortedTags = useMemo(() => [...tags].sort(tagsSorter), [tags]);

  if (isTagsLoading) {
    return <Spinner size="xs" />;
  }
  return (
    <TableTagSelector
      tags={sortedTags}
      agentTags={agent.tags}
      agentConfigurationId={agent.sId}
      owner={owner}
      onChange={async () => onRefresh()}
    />
  );
}

// Cells render as components, so recreating their renderer functions remounts them:
// an open menu closes and an in-flight checkbox click is lost.
/**
 * @cc [owner:aubin-tchoi,label:product] mobile-table-layout
 * Below 768px viewport width, Usage MUST remain visible unless sorting by Last edited,
 * which MUST then remain visible instead. Names MUST truncate to leave room for that
 * column and row actions. Other columns appear as table space allows. At 768px and above,
 * preserve the existing layout. Sorting MUST NOT replace cell renderers. Column visibility
 * rules MUST remain in each column definition.
 */
/**
 * @cc [owner:tdraier,label:react;performance] stable-columns
 * `columns` MUST only be rebuilt when `canSelect`, `onSelect`, `onRefresh`, `owner`, `readOnly`,
 * `renderActions`, the theme or the locale change, never on data the table loads itself. Callers MUST keep
 * `canSelect`, `onSelect`, `onRefresh` and `renderActions` referentially stable while the search
 * inputs are unchanged.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] agent-name-tooltip
 * Hovering or focusing an agent name must show its name and description.
 */
/**
 * @cc [owner:aubin-tchoi,label:react] matching-table-density
 * The loaded table and its loading skeleton MUST use the same density.
 * Skeleton cells MUST match the loaded cells' alignment, visual sizes and spacing.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] batch-selection-availability
 * The selection column MUST be hidden when none of the displayed agents satisfy `canSelect`.
 */
export function AgentSearchTable({
  owner,
  readOnly = false,
  renderActions,
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
  const { t } = useLingui();
  const { isDark } = useTheme();
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
                      ? t`Clear selection`
                      : t`Select all on page`
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
            const agentName = row.original.name;
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
                      ? t`Deselect ${agentName}`
                      : t`Select ${agentName}`
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
          header: t`Name`,
          sortDescFirst: false,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <DataTable.CellContent>
              <Tooltip
                align="start"
                label={
                  <div className="py-1.5">
                    <EntityTooltipCard
                      avatar={
                        <Avatar
                          name={agent.name}
                          visual={agent.pictureUrl}
                          size="xs"
                        />
                      }
                      name={agent.name}
                      description={agent.description}
                    />
                  </div>
                }
                tooltipTriggerAsChild
                trigger={
                  <button type="button" className="w-full min-w-0 text-left">
                    <div className="flex flex-row items-center gap-2 py-1">
                      <div>
                        <Avatar visual={agent.pictureUrl} size="xs" />
                      </div>
                      <div className="heading-sm min-w-0 grow overflow-hidden truncate text-foreground">
                        {agent.name}
                      </div>
                    </div>
                  </button>
                }
              />
            </DataTable.CellContent>
          ),
          meta: { className: "md:w-48 md:@lg:w-full", rowHeader: true },
        },
        {
          id: "access" as const,
          header: t`Access`,
          cell: ({ row: { original: agent } }) => (
            <DataTable.CellContent>
              {agent.scope !== "hidden" && (
                <Chip
                  size="xs"
                  label={t(SCOPE_SHORT_LABELS[agent.scope])}
                  color={SCOPE_INFO[agent.scope].color}
                  icon={SCOPE_INFO[agent.scope].icon}
                />
              )}
            </DataTable.CellContent>
          ),
          meta: {
            type: "status",
            className: "hidden @lg:w-32 @lg:table-cell",
          },
        },
        {
          id: "model" as const,
          header: t`Model`,
          cell: ({ row: { original: agent } }) => (
            <AgentSearchModelCell model={agent.model} isDark={isDark} />
          ),
          meta: {
            className:
              "hidden w-28 max-md:@xs:table-cell max-md:@max-[40rem]:[.sort-by-last-edited_&]:hidden @sm:table-cell @xl:w-32",
          },
        },
        {
          id: "usage" as const,
          accessorKey: "activeUsersCount",
          header: t`Usage`,
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <DataTable.BasicCellContent
              className="font-mono"
              label={
                agent.activeUsersCount === null
                  ? "-"
                  : formatNumber(agent.activeUsersCount)
              }
              tooltip={
                agent.activeUsersCount === null
                  ? t`Usage is not available for this agent.`
                  : t`Number of active users in the last 30 days.`
              }
            />
          ),
          meta: {
            type: "numeric",
            className:
              "hidden w-24 max-md:table-cell max-md:@max-[32rem]:[.sort-by-last-edited_&]:hidden @sm:table-cell",
          },
        },
        {
          id: "feedback" as const,
          header: t`Feedback`,
          cell: ({ row: { original: agent } }) => {
            if (agent.scope === "global") {
              return <DataTable.BasicCellContent label="-" />;
            }
            const { up, down } = agent.feedbacks;
            const total = up + down;
            return (
              <DataTable.BasicCellContent
                className="font-mono"
                label={`${total}`}
                tooltip={t`${plural(total, {
                  one: `${up} positive and ${down} negative feedback`,
                  other: `${up} positive and ${down} negative feedbacks`,
                })}`}
              />
            );
          },
          meta: {
            type: "numeric",
            className: "hidden @lg:w-24 @lg:table-cell",
          },
        },
        {
          id: "editors" as const,
          header: t`Editors`,
          cell: ({ row: { original: agent } }) => (
            <SkillEditorsCell
              editors={agent.scope === "global" ? null : agent.editors}
            />
          ),
          meta: { className: "hidden pl-8 @lg:w-32 @lg:table-cell" },
        },
        {
          id: "tags" as const,
          header: t`Tags`,
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
                  {canSelect(agent) && (
                    <AgentSearchTagSelector
                      owner={owner}
                      agent={agent}
                      onRefresh={onRefresh}
                    />
                  )}
                </div>
              </DataTable.CellContent>
            );
          },
          meta: { className: "hidden @lg:table-cell @lg:w-24 @xl:w-40" },
        },
        {
          id: "updatedAt" as const,
          accessorKey: "updatedAt",
          header: t`Last edited`,
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: agent } }) => (
            <SkillLastEditedCell updatedAt={agent.updatedAt} emptyLabel="-" />
          ),
          meta: {
            className:
              "hidden w-32 max-md:[.sort-by-last-edited_&]:table-cell @sm:table-cell",
          },
        },
        {
          id: "actions" as const,
          header: "",
          cell: ({ row: { original: agent } }) =>
            renderActions ? (
              renderActions(agent, onRefresh)
            ) : readOnly || agent.status === "archived" ? null : agent.scope ===
              "global" ? (
              <DefaultAgentToggle
                owner={owner}
                agent={agent}
                onRefresh={onRefresh}
              />
            ) : (
              <AgentSearchActionsMenu
                owner={owner}
                agentId={agent.sId}
                scope={agent.scope}
                onSelect={onSelect}
                onRefresh={onRefresh}
              />
            ),
          meta: { className: "w-14 md:hidden md:@md:table-cell" },
        },
      ] satisfies ColumnDef<AgentSearchRow>[],
    [canSelect, isDark, onRefresh, onSelect, owner, readOnly, renderActions, t]
  );

  const hasSelectableRows = !readOnly && agents.some(canSelect);
  const visibleColumns = useMemo(
    () =>
      hasSelectableRows
        ? columns
        : columns.filter((column) => column.id !== "select"),
    [columns, hasSelectableRows]
  );
  // Expose sorting to column CSS without recreating cell renderers.
  const tableClassName =
    sorting[0]?.id === "updatedAt" ? "sort-by-last-edited" : undefined;

  // Show skeletons only when no rows are available; keep previous results during refreshes.
  // Mirror BasicCellContent's inner h-12 so the divider contributes equally to row height.
  if (isLoading && agents.length === 0) {
    return (
      <div
        role="status"
        aria-label={t`Loading agents`}
        className={tableClassName}
      >
        <DataTableSkeleton
          columns={visibleColumns}
          rowCount={12}
          density="default"
          SkeletonCell={({ columnId, rowIndex }) => {
            switch (columnId) {
              case "select":
                return (
                  <div className="flex size-full items-center justify-center">
                    <LoadingBlock className="h-4 w-4 rounded-sm" />
                  </div>
                );
              case "name":
                return (
                  <AvatarCellSkeleton>
                    <TextCellSkeleton
                      className={rowIndex % 2 === 0 ? "h-4 w-32" : "h-4 w-40"}
                    />
                  </AvatarCellSkeleton>
                );
              case "model":
                return (
                  <div className="flex items-center gap-2">
                    <LoadingBlock className="h-5 w-5 shrink-0 rounded-sm" />
                    <ChipCellSkeleton className="w-16" />
                  </div>
                );
              case "access":
                return <ChipCellSkeleton />;
              case "tags":
                return <TextCellSkeleton className="w-16" />;
              case "feedback":
                return (
                  <div className="flex h-12 items-center justify-end">
                    <TextCellSkeleton className="w-8" />
                  </div>
                );
              case "usage":
                return (
                  <div className="flex h-12 items-center justify-end">
                    <TextCellSkeleton className="w-8" />
                  </div>
                );
              case "editors":
                return <LoadingBlock className="h-6 w-6 rounded-full" />;
              case "updatedAt":
                return (
                  <div className="flex h-12 items-center">
                    <TextCellSkeleton className="w-20" />
                  </div>
                );
              case "actions":
                return <LoadingBlock className="h-8 w-8 rounded-xl" />;
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
      className={tableClassName}
      data={agents.map((agent) => ({
        ...agent,
        onClick: () => onSelect(agent.sId),
      }))}
      columns={visibleColumns}
      density="default"
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
