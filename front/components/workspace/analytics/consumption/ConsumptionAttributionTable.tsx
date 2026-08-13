import {
  AvatarNameCell,
  CostShareCell,
} from "@app/components/workspace/analytics/creditsTableCells";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import { useDebounce } from "@app/hooks/useDebounce";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_DIMENSION_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";
import { formatCredits } from "@app/lib/client/credits";
import {
  BarChart01,
  Button,
  ChevronDown,
  ChevronUp,
  DataTable,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import type { Transition, Variants } from "framer-motion";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import type { AttributionRowData } from "./ConsumptionAttributionRowsTable";
import { ConsumptionAttributionRowsTable } from "./ConsumptionAttributionRowsTable";
import type { ConsumptionDimension } from "./consumptionDimensions";
import {
  CONSUMPTION_DIMENSION_CONFIG,
  CONSUMPTION_DIMENSIONS,
  isConsumptionDimension,
} from "./consumptionDimensions";

// The consumption endpoints rank via an Elasticsearch terms aggregation
// (no offset/cursor support), so we fetch the maximum allowed batch once and
// paginate over it client-side.
const TOP_FETCH_LIMIT = 100;

const ATTRIBUTION_PAGE_SIZE = 25;

const SEARCH_DEBOUNCE_DELAY_MS = 300;

type AttributionTransitionDirection = -1 | 0 | 1;

interface AttributionTransition {
  target: ConsumptionDimension | null;
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
  currentDimension: ConsumptionDimension,
  nextDimension: ConsumptionDimension
): AttributionTransitionDirection {
  const currentIndex = CONSUMPTION_DIMENSIONS.indexOf(currentDimension);
  const nextIndex = CONSUMPTION_DIMENSIONS.indexOf(nextDimension);

  if (currentIndex === nextIndex) {
    return 0;
  }

  return nextIndex > currentIndex ? 1 : -1;
}

function buildColumns({
  hasAvatar,
  isAvatarRounded,
  avgLabel,
  totalCredits,
}: {
  hasAvatar: boolean;
  isAvatarRounded: boolean;
  avgLabel: string;
  totalCredits: number;
}): ColumnDef<AttributionRowData>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      meta: { sizeRatio: 32, headerAlign: "left" },
      cell: (info) => {
        const { name, pictureUrl } = info.row.original;
        return (
          <DataTable.CellContent className="w-full justify-start text-left">
            {hasAvatar ? (
              <AvatarNameCell
                name={name}
                imageUrl={pictureUrl}
                isRounded={isAvatarRounded}
              />
            ) : (
              <span className="truncate text-sm">{name}</span>
            )}
          </DataTable.CellContent>
        );
      },
    },
    {
      id: "costShare",
      header: "Cost share",
      meta: { sizeRatio: 20, headerAlign: "left" },
      cell: (info) => (
        <DataTable.CellContent className="w-full justify-start">
          <CostShareCell
            share={
              totalCredits > 0 ? info.row.original.credits / totalCredits : 0
            }
          />
        </DataTable.CellContent>
      ),
    },
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
      meta: { sizeRatio: 22, headerAlign: "right" },
      cell: (info) => (
        <DataTable.BasicCellContent
          className="justify-end text-right tabular-nums"
          label={formatCredits(info.row.original.avgCredits)}
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
        return (
          <DataTable.CellContent className="w-full justify-end">
            <Button
              icon={row.isExpanded ? ChevronUp : ChevronDown}
              variant="ghost-secondary"
              size="xs"
              aria-label={`${row.isExpanded ? "Collapse" : "Expand"} breakdown for ${row.name}`}
              aria-expanded={row.isExpanded}
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
      meta: { className: "w-12", headerAlign: "right" },
      cell: (info) => {
        const row = info.row.original;
        return (
          <DataTable.CellContent className="w-full justify-end">
            <Button
              icon={BarChart01}
              variant="ghost-secondary"
              size="xs"
              disabled={row.isFilterSelected}
              tooltip={
                row.isFilterSelected ? "Already in filters" : "Add to filters"
              }
              aria-label={
                row.isFilterSelected
                  ? `${row.name} is already in filters`
                  : `Add ${row.name} to filters`
              }
              onClick={(event) => {
                event.stopPropagation();
                row.onAddFilter();
              }}
            />
          </DataTable.CellContent>
        );
      },
    },
  ];
}

interface AttributionRowsProps {
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  onAddFilter: (row: ConsumptionTopRow) => void;
  search: string;
  onViewAll: (
    dimension: ConsumptionDimension,
    selectedRow: ConsumptionTopRow
  ) => void;
}

function AttributionRows({
  workspaceId,
  dimension,
  period,
  filter,
  onAddFilter,
  search,
  onViewAll,
}: AttributionRowsProps) {
  const { hasAvatar, avgLabel } = CONSUMPTION_DIMENSION_CONFIG[dimension];
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ATTRIBUTION_PAGE_SIZE,
  });
  const shouldReduceMotion = useReducedMotion();

  const {
    rows: allRows,
    totalCredits,
    isTopLoading,
    isTopError,
  } = useConsumptionTop({
    workspaceId,
    dimension,
    period,
    limit: TOP_FETCH_LIMIT,
    filter,
  });

  // Client-side filter over the loaded ranking. A row outside the top
  // TOP_FETCH_LIMIT will not appear — the endpoint has no server-side search yet.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? allRows.filter((row) => row.name.toLowerCase().includes(needle))
      : allRows;
  }, [allRows, search]);

  const clampedPagination: PaginationState = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(rows.length / pagination.pageSize));
    return {
      pageSize: pagination.pageSize,
      pageIndex: Math.min(pagination.pageIndex, pageCount - 1),
    };
  }, [rows.length, pagination.pageSize, pagination.pageIndex]);

  const columns = useMemo(
    () =>
      buildColumns({
        hasAvatar,
        isAvatarRounded: dimension === "user",
        avgLabel,
        totalCredits,
      }),
    [hasAvatar, dimension, avgLabel, totalCredits]
  );

  const attributionData: AttributionRowData[] = useMemo(() => {
    const selectedIdSet = new Set(
      filter?.[CONSUMPTION_DIMENSION_FILTER_KEYS[dimension]] ?? []
    );
    return rows.map((row) => ({
      ...row,
      isExpanded: expandedRowId === row.id,
      isFilterSelected: selectedIdSet.has(row.id),
      onClick: () =>
        setExpandedRowId((current) => (current === row.id ? null : row.id)),
      onAddFilter: () => onAddFilter(row),
    }));
  }, [rows, expandedRowId, filter, dimension, onAddFilter]);

  let contentKey = "content";
  let content: ReactNode;

  if (isTopLoading) {
    contentKey = "loading";
    content = (
      <ConsumptionAttributionRowsTable
        data={[]}
        columns={columns}
        workspaceId={workspaceId}
        dimension={dimension}
        period={period}
        filter={filter}
        onViewAll={onViewAll}
        pagination={pagination}
        setPagination={setPagination}
        isLoading
        hasAvatar={hasAvatar}
        isAvatarRounded={dimension === "user"}
      />
    );
  } else if (isTopError) {
    content = (
      <div className="text-sm text-muted-foreground">
        Failed to load attribution.
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <div className="text-sm text-muted-foreground">
        {search.trim()
          ? `No match for "${search.trim()}".`
          : "No consumption over this period."}
      </div>
    );
  } else {
    content = (
      <div className="overflow-x-auto">
        <ConsumptionAttributionRowsTable
          data={attributionData}
          columns={columns}
          workspaceId={workspaceId}
          dimension={dimension}
          period={period}
          filter={filter}
          onViewAll={onViewAll}
          pagination={clampedPagination}
          setPagination={setPagination}
        />
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
        aria-busy={isTopLoading}
      >
        {content}
      </m.div>
    </AnimatePresence>
  );
}

interface ConsumptionAttributionTableProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  onAddFilter: (row: ConsumptionTopRow) => void;
  // Owned by the page: the selected tab also drives the chart's breakdown.
  dimension: ConsumptionDimension;
  onDimensionChange: (dimension: ConsumptionDimension) => void;
  onViewAll: (
    dimension: ConsumptionDimension,
    selectedRow: ConsumptionTopRow
  ) => void;
}

export function ConsumptionAttributionTable({
  workspaceId,
  period,
  filter,
  onAddFilter,
  dimension,
  onDimensionChange,
  onViewAll,
}: ConsumptionAttributionTableProps) {
  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: SEARCH_DEBOUNCE_DELAY_MS,
  });
  const pendingPointerDimension = useRef<ConsumptionDimension | null>(null);
  const [transition, setTransition] = useState<AttributionTransition>({
    target: null,
    direction: 0,
  });
  const shouldReduceMotion = useReducedMotion();
  const effectiveTransitionDirection =
    shouldReduceMotion || transition.target !== dimension
      ? 0
      : transition.direction;

  return (
    <div className="rounded-lg border border-border bg-panel-background p-4">
      <Tabs
        value={dimension}
        onValueChange={(value) => {
          if (isConsumptionDimension(value)) {
            setTransition({
              target: value,
              direction:
                pendingPointerDimension.current === value
                  ? getAttributionTransitionDirection(dimension, value)
                  : 0,
            });
            pendingPointerDimension.current = null;
            onDimensionChange(value);
          }
        }}
      >
        <TabsList border>
          {CONSUMPTION_DIMENSIONS.map((tabDimension) => (
            <TabsTrigger
              key={tabDimension}
              value={tabDimension}
              label={CONSUMPTION_DIMENSION_CONFIG[tabDimension].label}
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
      <SearchInput
        name="consumption-attribution-search"
        placeholder="Search…"
        value={inputValue}
        onChange={setValue}
        className="mt-3 w-full"
      />
      <div className="relative overflow-hidden pt-3">
        <AnimatePresence
          initial={false}
          mode="popLayout"
          custom={effectiveTransitionDirection}
        >
          <m.div
            key={dimension}
            custom={effectiveTransitionDirection}
            variants={ATTRIBUTION_BODY_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* A dimension selects a different dataset, so its table state must not carry over. */}
            <AttributionRows
              workspaceId={workspaceId}
              dimension={dimension}
              period={period}
              filter={filter}
              onAddFilter={onAddFilter}
              search={debouncedValue}
              onViewAll={onViewAll}
            />
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
