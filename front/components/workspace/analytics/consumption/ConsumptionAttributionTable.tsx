import { getModelLogoByModelId } from "@app/components/providers/types";
import {
  getAvatarFromIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { ConsumptionConversationAttribution } from "@app/components/workspace/analytics/consumption/ConsumptionConversationAttribution";
import { ConsumptionExportPanel } from "@app/components/workspace/analytics/consumption/ConsumptionExportPanel";
import {
  AvatarNameCell,
  CostShareCell,
  EntityTooltipCard,
} from "@app/components/workspace/analytics/creditsTableCells";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import { useDebounce } from "@app/hooks/useDebounce";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/constants";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import type { ConsumptionExportBody } from "@app/lib/api/analytics/consumption/schema";
import { formatAvgCredits, formatCredits } from "@app/lib/client/credits";
import { LinkWrapper } from "@app/lib/platform";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopSortOrder,
} from "@app/types/api/analytics/consumption";
import { CONSUMPTION_DIMENSION_FILTER_KEYS } from "@app/types/api/analytics/consumption";
import {
  ArrowNarrowDownRight,
  ArrowNarrowUpRight,
  Avatar,
  Button,
  ChevronDown,
  ChevronUp,
  cn,
  DataTable,
  DustLogoSquare,
  FilterFunnel01,
  Icon,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  Pagination,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  XCircle,
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import type { Transition, Variants } from "framer-motion";
import {
  AnimatePresence,
  domMax,
  LazyMotion,
  m,
  useReducedMotion,
} from "framer-motion";
import type { ComponentType, Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  AttributionRowData,
  ConsumptionAttributionRowsTableProps,
} from "./ConsumptionAttributionRowsTable";
import { ConsumptionAttributionRowsTable } from "./ConsumptionAttributionRowsTable";
import type {
  ConsumptionAttributionDimension,
  ConsumptionDimension,
} from "./consumptionDimensions";
import {
  CONSUMPTION_ATTRIBUTION_DIMENSIONS,
  CONSUMPTION_DIMENSION_CONFIG,
  consumptionAttributionDimensionLabel,
  DEFAULT_CONSUMPTION_DIMENSION,
  getConsumptionAttributionDimensions,
  isConsumptionAttributionDimension,
} from "./consumptionDimensions";

const SEARCH_DEBOUNCE_DELAY_MS = 300;
const ATTRIBUTION_PAGE_SIZE = 25;
const ATTRIBUTION_MAX_ROW_COUNT = 1_000;
const DEFAULT_ATTRIBUTION_SORTING: SortingState = [
  { id: "credits", desc: true },
];

const ATTRIBUTION_SERVER_SORTABLE_COLUMN_IDS = new Set([
  "credits",
  "costShare",
]);

type AttributionTransitionDirection = -1 | 0 | 1;

interface AttributionTransition {
  target: ConsumptionAttributionDimension | null;
  direction: AttributionTransitionDirection;
}

const ATTRIBUTION_BODY_TRANSITION = {
  duration: MOTION_DURATIONS.exit,
  ease: MOTION_EASINGS.enter,
} satisfies Transition;

const ATTRIBUTION_BODY_VARIANTS: Variants = {
  initial: (direction: number) => ({
    opacity: direction === 0 ? 1 : 0,
    x: direction * 4,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: ATTRIBUTION_BODY_TRANSITION,
  },
  exit: (direction: number) => ({
    opacity: direction === 0 ? 1 : 0,
    pointerEvents: "none",
    transition: direction === 0 ? { duration: 0 } : ATTRIBUTION_BODY_TRANSITION,
    x: direction * -4,
  }),
};

function getAttributionTransitionDirection(
  currentDimension: ConsumptionAttributionDimension,
  nextDimension: ConsumptionAttributionDimension
): AttributionTransitionDirection {
  const currentIndex =
    CONSUMPTION_ATTRIBUTION_DIMENSIONS.indexOf(currentDimension);
  const nextIndex = CONSUMPTION_ATTRIBUTION_DIMENSIONS.indexOf(nextDimension);

  if (currentIndex === nextIndex) {
    return 0;
  }

  return nextIndex > currentIndex ? 1 : -1;
}

function AttributionTooltipCard({
  row,
  dimension,
}: {
  row: ConsumptionTopRow;
  dimension: "agent" | "skill";
}) {
  const SkillAvatar = getSkillAvatarIcon(row.icon);

  return (
    <EntityTooltipCard
      avatar={
        dimension === "agent" ? (
          <Avatar
            name={row.name}
            visual={row.pictureUrl ?? undefined}
            size="xs"
          />
        ) : (
          <SkillAvatar name={row.name} size="xs" />
        )
      }
      name={row.name}
      description={row.description}
      modelId={dimension === "agent" ? row.modelId : null}
      modelDisplayName={dimension === "agent" ? row.modelDisplayName : null}
    />
  );
}

// Growth is undefined (not just zero) with no prior credits to grow from, so
// callers must distinguish that case from an actual percentage.
function growthPercent(
  currentCredits: number,
  previousCredits: number | null
): number | null {
  return previousCredits && previousCredits > 0
    ? ((currentCredits - previousCredits) / previousCredits) * 100
    : null;
}

function VsPrevCell({
  credits,
  previousCredits,
}: {
  credits: number;
  previousCredits: number | null;
}) {
  const growth = growthPercent(credits, previousCredits);

  if (growth === null) {
    return (
      <DataTable.CellContent className="w-full justify-end text-right">
        <Tooltip
          label="Not enough data to compute"
          tooltipTriggerAsChild
          trigger={<span className="text-sm text-muted-foreground">--</span>}
        />
      </DataTable.CellContent>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full items-center justify-end gap-1 text-right text-sm tabular-nums",
        growth > 100 ? "text-highlight-600" : "text-muted-foreground"
      )}
    >
      <Icon
        visual={growth >= 0 ? ArrowNarrowUpRight : ArrowNarrowDownRight}
        size="xs"
      />
      <span>{Math.round(Math.abs(growth))}%</span>
    </div>
  );
}

function usageVsWorkspaceAverage({
  credits,
  activeMembers,
  totalCredits,
  totalActiveMembers,
}: {
  credits: number;
  activeMembers: number | undefined;
  totalCredits: number;
  totalActiveMembers: number;
}): number | null {
  if (!activeMembers || totalCredits <= 0 || totalActiveMembers <= 0) {
    return null;
  }

  const groupAverageCredits = credits / activeMembers;
  const workspaceAverageCredits = totalCredits / totalActiveMembers;

  return groupAverageCredits / workspaceAverageCredits;
}

function buildColumns({
  dimension,
  hasAvatar,
  isAvatarRounded,
  avgLabel,
  totalCredits,
  totalActiveMembers,
  isDark,
  expandedRowId,
  selectedIdSet,
}: {
  dimension: ConsumptionDimension;
  hasAvatar: boolean;
  isAvatarRounded: boolean;
  avgLabel: string;
  totalCredits: number;
  totalActiveMembers: number;
  isDark: boolean;
  expandedRowId: string | null;
  selectedIdSet: Set<string>;
}): ColumnDef<AttributionRowData>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      enableSorting: false,
      meta: { sizeRatio: 32, headerAlign: "left" },
      cell: (info) => {
        const row = info.row.original;
        const { name, pictureUrl, description, icon } = row;
        const SkillAvatar = getSkillAvatarIcon(icon);
        const toolIcon =
          icon &&
          (isCustomResourceIconType(icon) || isInternalAllowedIcon(icon))
            ? icon
            : DEFAULT_MCP_SERVER_ICON;
        const content =
          dimension === "skill" ? (
            <div className="flex min-w-0 items-center gap-2">
              <SkillAvatar name={name} size="xs" />
              <span className="truncate text-sm">{name}</span>
            </div>
          ) : dimension === "tool" ? (
            <div className="flex min-w-0 items-center gap-2">
              {getAvatarFromIcon(toolIcon, "xs")}
              <span className="truncate text-sm">{name}</span>
            </div>
          ) : dimension === "model" ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center">
                <Icon
                  visual={
                    getModelLogoByModelId(row.id, isDark) ?? DustLogoSquare
                  }
                  size="sm"
                />
              </span>
              <span className="truncate text-sm">{name}</span>
            </div>
          ) : hasAvatar ? (
            <div className="min-w-0">
              <AvatarNameCell
                name={name}
                imageUrl={pictureUrl}
                isRounded={isAvatarRounded}
              />
            </div>
          ) : (
            <span className="truncate text-sm">{name}</span>
          );
        const interactiveClassName = cn(
          "inline-flex min-h-11 min-w-11 max-w-full items-center rounded-sm text-left",
          "outline-hidden ring-offset-background",
          "pointer-fine:hover:underline",
          "focus-visible:ring-2 focus-visible:ring-highlight-300 focus-visible:ring-offset-1"
        );
        const interactiveContent = row.detailsHref ? (
          <LinkWrapper
            href={row.detailsHref}
            className={cn(
              interactiveClassName,
              "text-highlight-500 pointer-fine:hover:text-highlight-600"
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {content}
          </LinkWrapper>
        ) : row.onNameClick ? (
          <button
            type="button"
            className={cn(interactiveClassName, "cursor-pointer")}
            onClick={(event) => {
              event.stopPropagation();
              row.onNameClick?.();
            }}
          >
            {content}
          </button>
        ) : (
          content
        );

        return (
          <DataTable.CellContent className="w-full justify-start text-left">
            {description && (dimension === "agent" || dimension === "skill") ? (
              <Tooltip
                label={
                  <AttributionTooltipCard row={row} dimension={dimension} />
                }
                className="p-3"
                tooltipTriggerAsChild
                trigger={interactiveContent}
              />
            ) : (
              interactiveContent
            )}
          </DataTable.CellContent>
        );
      },
    },
    ...(dimension === "group"
      ? ([
          {
            id: "activeMembers",
            header: "Active members",
            enableSorting: false,
            meta: { sizeRatio: 18, headerAlign: "right" },
            cell: (info) => (
              <DataTable.BasicCellContent
                className="justify-end text-right tabular-nums"
                label={
                  info.row.original.activeMembers?.toLocaleString("en-US") ??
                  "--"
                }
              />
            ),
          },
          {
            id: "usageVsWorkspaceAverage",
            header: "Usage vs workspace avg",
            enableSorting: false,
            meta: { sizeRatio: 22, headerAlign: "right" },
            cell: (info) => {
              const usageRatio = usageVsWorkspaceAverage({
                credits: info.row.original.credits,
                activeMembers: info.row.original.activeMembers,
                totalCredits,
                totalActiveMembers,
              });

              return (
                <DataTable.BasicCellContent
                  className="justify-end text-right tabular-nums"
                  label={
                    usageRatio === null
                      ? "--"
                      : `${usageRatio.toLocaleString("en-US", {
                          maximumFractionDigits: 1,
                        })}×`
                  }
                />
              );
            },
          },
        ] satisfies ColumnDef<AttributionRowData>[])
      : ([
          {
            id: "costShare",
            // Same denominator (totalCredits) for every row, so ranking by cost
            // share is the same order as ranking by credits
            accessorFn: (row) =>
              totalCredits > 0 ? row.credits / totalCredits : 0,
            header: "Consumption share",
            enableSorting: true,
            meta: {
              className: "w-36",
              sizeRatio: 20,
              headerAlign: "left",
            },
            cell: (info) => (
              <DataTable.CellContent className="w-full justify-start">
                <CostShareCell
                  share={
                    totalCredits > 0
                      ? info.row.original.credits / totalCredits
                      : 0
                  }
                />
              </DataTable.CellContent>
            ),
          },
        ] satisfies ColumnDef<AttributionRowData>[])),
    {
      id: "credits",
      accessorKey: "credits",
      header: "Total credits",
      meta: { sizeRatio: 20, headerAlign: "right" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="justify-end text-right tabular-nums"
          label={formatCredits(info.row.original.credits)}
        />
      ),
    },
    {
      id: "avgCredits",
      accessorKey: "avgCredits",
      header: avgLabel,
      enableSorting: false,
      meta: { sizeRatio: 22, headerAlign: "right" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="justify-end text-right tabular-nums"
          label={formatAvgCredits(info.row.original.avgCredits)}
        />
      ),
    },
    {
      id: "vsPrev",
      header: "vs prev",
      enableSorting: false,
      meta: { className: "w-16", sizeRatio: 18, headerAlign: "right" },
      cell: (info) => (
        <VsPrevCell
          credits={info.row.original.credits}
          previousCredits={info.row.original.previousCredits}
        />
      ),
    },
    {
      id: "details",
      header: "",
      enableSorting: false,
      meta: { className: "w-12", headerAlign: "right" },
      cell: (info) => {
        const row = info.row.original;
        const isExpanded = expandedRowId === row.id;
        return (
          <DataTable.CellContent className="w-full justify-end">
            <Button
              icon={isExpanded ? ChevronUp : ChevronDown}
              variant="ghost-secondary"
              size="xs"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} breakdown for ${row.name}`}
              aria-expanded={isExpanded}
              onClick={(event) => {
                event.stopPropagation();
                row.onClick();
              }}
            />
          </DataTable.CellContent>
        );
      },
    },
    {
      id: "filter",
      header: "",
      enableSorting: false,
      meta: { className: "w-12 p-0", headerAlign: "right" },
      cell: (info) => {
        const row = info.row.original;
        const isFilterSelected = selectedIdSet.has(row.id);
        return (
          <Button
            icon={isFilterSelected ? XCircle : FilterFunnel01}
            variant="ghost-secondary"
            size="xs"
            className="h-12 w-full rounded-none"
            tooltip={
              isFilterSelected ? "Remove from filters" : "Add to filters"
            }
            aria-label={
              isFilterSelected
                ? `Remove ${row.name} from filters`
                : `Add ${row.name} to filters`
            }
            onClick={(event) => {
              event.stopPropagation();
              if (isFilterSelected) {
                row.onRemoveFilter();
              } else {
                row.onAddFilter();
              }
            }}
          />
        );
      },
    },
  ];
}

export interface ConsumptionAttributionRowsProps {
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  analyticsScope?: ConsumptionAnalyticsScope;
  disabled?: boolean;
  onAddFilter: (row: ConsumptionTopRow) => void;
  onAgentClick?: (agentId: string) => void;
  onRemoveFilter: (row: ConsumptionTopRow) => void;
  onSkillClick?: (skillId: string) => void;
  search: string;
  onViewAll: (
    dimension: ConsumptionDimension,
    selectedRow: ConsumptionTopRow
  ) => void;
}

export interface ConsumptionAttributionRowsData {
  rows: ConsumptionTopRow[];
  totalCredits: number;
  totalActiveMembers: number;
  totalCount: number;
  isTopLoading: boolean;
  isTopError: boolean;
  isTopValidating: boolean;
}

export interface ConsumptionAttributionRowsQueryState {
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  sortOrder: ConsumptionTopSortOrder;
}

export function useConsumptionAttributionRowsQueryState(): ConsumptionAttributionRowsQueryState {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ATTRIBUTION_PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<SortingState>(
    DEFAULT_ATTRIBUTION_SORTING
  );

  // A new sort order invalidates the current page's offset into it, so jump
  // back to the first page whenever it changes.
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting(updater);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const activeSort = sorting[0];
  // Ranking is always by credits: only forward asc/desc when the sorted
  // column actually rides that ranking, so sorting by anything else keeps
  // fetching pages in the default credits-desc order and reorders them
  // locally instead.
  const sortOrder =
    activeSort?.id &&
    ATTRIBUTION_SERVER_SORTABLE_COLUMN_IDS.has(activeSort.id) &&
    !activeSort.desc
      ? "asc"
      : "desc";

  return {
    pagination,
    setPagination,
    sorting,
    onSortingChange,
    sortOrder,
  };
}

interface ConsumptionAttributionRowsViewProps
  extends ConsumptionAttributionRowsProps {
  data: ConsumptionAttributionRowsData;
  emptyMessage: string;
  queryState: ConsumptionAttributionRowsQueryState;
  RowsTableComponent: ComponentType<ConsumptionAttributionRowsTableProps>;
}

export function ConsumptionAttributionRowsView({
  workspaceId,
  dimension,
  period,
  filter,
  analyticsScope,
  disabled,
  onAddFilter,
  onAgentClick,
  onRemoveFilter,
  onSkillClick,
  search,
  onViewAll,
  emptyMessage,
  data: {
    rows,
    totalCredits,
    totalActiveMembers,
    totalCount,
    isTopLoading,
    isTopError,
    isTopValidating,
  },
  queryState: { pagination, setPagination, sorting, onSortingChange },
  RowsTableComponent,
}: ConsumptionAttributionRowsViewProps) {
  const { hasAvatar, avgLabel } = CONSUMPTION_DIMENSION_CONFIG[dimension];
  const { isDark } = useTheme();
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const cappedRowCount = Math.min(totalCount, ATTRIBUTION_MAX_ROW_COUNT);
  const selectedIdSet = useMemo(
    () => new Set(filter?.[CONSUMPTION_DIMENSION_FILTER_KEYS[dimension]] ?? []),
    [dimension, filter]
  );

  const columns = useMemo(
    () =>
      buildColumns({
        dimension,
        hasAvatar,
        isAvatarRounded: dimension === "user",
        avgLabel,
        totalCredits,
        totalActiveMembers,
        isDark,
        expandedRowId,
        selectedIdSet,
      }),
    [
      hasAvatar,
      dimension,
      avgLabel,
      totalCredits,
      totalActiveMembers,
      isDark,
      expandedRowId,
      selectedIdSet,
    ]
  );

  const data = useMemo<AttributionRowData[]>(
    () =>
      rows.map((row) => {
        let onNameClick: (() => void) | undefined;

        if (dimension === "agent" && row.modelId && onAgentClick) {
          onNameClick = () => onAgentClick(row.id);
        } else if (
          dimension === "skill" &&
          row.name !== row.id &&
          onSkillClick
        ) {
          onNameClick = () => onSkillClick(row.id);
        }

        return {
          ...row,
          onClick: () =>
            setExpandedRowId((current) => (current === row.id ? null : row.id)),
          onAddFilter: () => onAddFilter(row),
          onNameClick,
          onRemoveFilter: () => onRemoveFilter(row),
        };
      }),
    [dimension, rows, onAddFilter, onAgentClick, onRemoveFilter, onSkillClick]
  );
  const isLoading = isTopLoading;
  const skeletonRowCount =
    cappedRowCount > 0
      ? Math.min(
          pagination.pageSize,
          cappedRowCount - pagination.pageIndex * pagination.pageSize
        )
      : undefined;
  const paginationControls = cappedRowCount > pagination.pageSize && (
    <div className="mt-2 p-1">
      <Pagination
        size="xs"
        showDetails={false}
        pagination={pagination}
        setPagination={setPagination}
        rowCount={cappedRowCount}
      />
    </div>
  );

  let contentKey = "content";
  let content: ReactNode;

  if (isLoading) {
    contentKey = "loading";
    content = (
      <div>
        <div className="overflow-x-auto">
          <RowsTableComponent
            data={data}
            columns={columns}
            workspaceId={workspaceId}
            dimension={dimension}
            period={period}
            filter={filter}
            analyticsScope={analyticsScope}
            disabled={disabled}
            onViewAll={onViewAll}
            expandedRowId={expandedRowId}
            isLoading
            skeletonRowCount={skeletonRowCount}
            hasAvatar={hasAvatar}
            isAvatarRounded={dimension === "user"}
            sorting={sorting}
            onSortingChange={onSortingChange}
          />
        </div>
        {paginationControls}
      </div>
    );
  } else if (isTopError) {
    content = (
      <div className="text-sm text-muted-foreground">
        Failed to load attribution.
      </div>
    );
  } else {
    content = (
      <div>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {search.trim()
              ? `No results for "${search.trim()}". Only items with usage data appear here.`
              : emptyMessage}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <RowsTableComponent
              data={data}
              columns={columns}
              workspaceId={workspaceId}
              dimension={dimension}
              period={period}
              filter={filter}
              analyticsScope={analyticsScope}
              disabled={disabled}
              onViewAll={onViewAll}
              expandedRowId={expandedRowId}
              sorting={sorting}
              onSortingChange={onSortingChange}
            />
          </div>
        )}
        {paginationControls}
      </div>
    );
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <m.div
        key={contentKey}
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0 }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.1,
          ease: MOTION_EASINGS.enter,
        }}
        aria-busy={isLoading || isTopValidating}
      >
        {content}
      </m.div>
    </AnimatePresence>
  );
}

function WorkspaceConsumptionAttributionRows(
  props: ConsumptionAttributionRowsProps
) {
  const queryState = useConsumptionAttributionRowsQueryState();
  const {
    rows,
    totalCredits,
    totalActiveMembers,
    totalCount,
    isTopLoading,
    isTopError,
    isTopValidating,
  } = useConsumptionTop({
    workspaceId: props.workspaceId,
    dimension: props.dimension,
    period: props.period,
    limit: queryState.pagination.pageSize,
    offset: queryState.pagination.pageIndex * queryState.pagination.pageSize,
    search: props.search,
    filter: props.filter,
    analyticsScope: props.analyticsScope,
    sortOrder: queryState.sortOrder,
    disabled: props.disabled,
  });

  return (
    <ConsumptionAttributionRowsView
      {...props}
      data={{
        rows,
        totalCredits,
        totalActiveMembers,
        totalCount,
        isTopLoading,
        isTopError: Boolean(isTopError),
        isTopValidating,
      }}
      emptyMessage="No consumption over this period."
      queryState={queryState}
      RowsTableComponent={ConsumptionAttributionRowsTable}
    />
  );
}

export interface ConsumptionAttributionTableProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  analyticsScope?: ConsumptionAnalyticsScope;
  disabled?: boolean;
  onAddFilter: (row: ConsumptionTopRow) => void;
  onAgentClick?: (agentId: string) => void;
  onRemoveFilter: (row: ConsumptionTopRow) => void;
  onSkillClick?: (skillId: string) => void;
  // Owned by the page: the selected tab also drives the chart's breakdown.
  dimension: ConsumptionDimension;
  onDimensionChange: (dimension: ConsumptionDimension) => void;
  onViewAll: (
    dimension: ConsumptionDimension,
    selectedRow: ConsumptionTopRow
  ) => void;
  showExport?: boolean;
  onConversationNavigate?: () => void;
}

interface ConsumptionAttributionTableViewProps
  extends ConsumptionAttributionTableProps {
  AttributionRowsComponent: ComponentType<ConsumptionAttributionRowsProps>;
}

export function ConsumptionAttributionTableView({
  workspaceId,
  period,
  filter,
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
  disabled,
  onAddFilter,
  onAgentClick,
  onRemoveFilter,
  onSkillClick,
  dimension,
  onDimensionChange,
  onViewAll,
  showExport = true,
  onConversationNavigate,
  AttributionRowsComponent,
}: ConsumptionAttributionTableViewProps) {
  const { inputValue, debouncedValue, setValue, flush } = useDebounce("", {
    delay: SEARCH_DEBOUNCE_DELAY_MS,
  });

  // The search usually targeted the row being pinned; keeping it would leave
  // the freshly filtered table narrowed by a stale search.
  const handleAddFilter = useCallback(
    (row: ConsumptionTopRow) => {
      setValue("");
      flush();
      onAddFilter(row);
    },
    [setValue, flush, onAddFilter]
  );
  const [isConversationSelected, setIsConversationSelected] = useState(false);
  const isPersonal = analyticsScope.kind === "personal";
  const activeDimension =
    isPersonal && (dimension === "user" || dimension === "group")
      ? DEFAULT_CONSUMPTION_DIMENSION
      : dimension;
  const attributionDimension: ConsumptionAttributionDimension =
    isPersonal && isConversationSelected ? "conversation" : activeDimension;
  const pendingPointerDimension =
    useRef<ConsumptionAttributionDimension | null>(null);
  const [transition, setTransition] = useState<AttributionTransition>({
    target: null,
    direction: 0,
  });
  const shouldReduceMotion = useReducedMotion();
  const effectiveTransitionDirection =
    shouldReduceMotion || transition.target !== attributionDimension
      ? 0
      : transition.direction;
  const visibleDimensions = getConsumptionAttributionDimensions(analyticsScope);

  const exportBody: ConsumptionExportBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-foreground">Attribution</h3>
        {showExport && analyticsScope.kind === "workspace" && (
          <ConsumptionExportPanel
            workspaceId={workspaceId}
            exportBody={exportBody}
          />
        )}
      </div>
      <div className="rounded-lg border border-border bg-panel-background p-4">
        <div className="flex flex-col gap-3">
          <Tabs
            value={attributionDimension}
            onValueChange={(value) => {
              if (isConsumptionAttributionDimension(value)) {
                setTransition({
                  target: value,
                  direction:
                    pendingPointerDimension.current === value
                      ? getAttributionTransitionDirection(
                          attributionDimension,
                          value
                        )
                      : 0,
                });
                pendingPointerDimension.current = null;
                if (value === "conversation") {
                  setIsConversationSelected(true);
                } else {
                  setIsConversationSelected(false);
                  onDimensionChange(value);
                }
              }
            }}
          >
            <TabsList border>
              {visibleDimensions.map((tabDimension) => (
                <TabsTrigger
                  key={tabDimension}
                  value={tabDimension}
                  label={consumptionAttributionDimensionLabel(tabDimension)}
                  className={
                    tabDimension === "conversation" ? "ml-auto" : undefined
                  }
                  onPointerDown={() => {
                    pendingPointerDimension.current = tabDimension;
                  }}
                  onPointerCancel={() => {
                    pendingPointerDimension.current = null;
                  }}
                  onKeyDown={() => {
                    pendingPointerDimension.current = null;
                  }}
                />
              ))}
            </TabsList>
          </Tabs>
          {attributionDimension !== "conversation" && (
            <SearchInput
              name="consumption-attribution-search"
              placeholder="Search…"
              value={inputValue}
              onChange={setValue}
              className="w-full"
            />
          )}
          <LazyMotion features={domMax}>
            <div className="relative overflow-hidden">
              <AnimatePresence
                initial={false}
                mode="popLayout"
                custom={effectiveTransitionDirection}
              >
                <m.div
                  key={attributionDimension}
                  custom={effectiveTransitionDirection}
                  variants={ATTRIBUTION_BODY_VARIANTS}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {/* Reset table state whenever its dataset or local search changes. */}
                  {attributionDimension === "conversation" ? (
                    <ConsumptionConversationAttribution
                      workspaceId={workspaceId}
                      period={period}
                      filter={filter}
                      disabled={disabled}
                      onNavigate={onConversationNavigate}
                    />
                  ) : (
                    <AttributionRowsComponent
                      key={JSON.stringify({
                        period,
                        filter,
                        search: debouncedValue,
                      })}
                      workspaceId={workspaceId}
                      dimension={attributionDimension}
                      period={period}
                      filter={filter}
                      analyticsScope={analyticsScope}
                      disabled={disabled}
                      onAddFilter={handleAddFilter}
                      onAgentClick={onAgentClick}
                      onRemoveFilter={onRemoveFilter}
                      onSkillClick={onSkillClick}
                      search={debouncedValue}
                      onViewAll={onViewAll}
                    />
                  )}
                </m.div>
              </AnimatePresence>
            </div>
          </LazyMotion>
        </div>
      </div>
    </div>
  );
}

export function ConsumptionAttributionTable(
  props: ConsumptionAttributionTableProps
) {
  return (
    <ConsumptionAttributionTableView
      {...props}
      AttributionRowsComponent={WorkspaceConsumptionAttributionRows}
    />
  );
}
