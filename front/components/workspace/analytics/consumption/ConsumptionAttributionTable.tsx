import { getModelLogoByModelId } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import {
  AvatarNameCell,
  CostShareCell,
} from "@app/components/workspace/analytics/creditsTableCells";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import { useDebounce } from "@app/hooks/useDebounce";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { normalizedConsumptionFilter } from "@app/lib/analytics/consumption_period";
import type { ConsumptionExportBody } from "@app/lib/api/analytics/consumption/schema";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/api/analytics/consumption/schema";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_DIMENSION_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";
import { formatCredits } from "@app/lib/client/credits";
import { getSkillAvatarIcon } from "@app/lib/skill";
import {
  Avatar,
  BarChart01,
  Button,
  ChevronDown,
  ChevronUp,
  DataTable,
  DustLogoSquare,
  Icon,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
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

const TOP_LIMIT = 25;

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

function AttributionTooltipCard({
  row,
  dimension,
}: {
  row: ConsumptionTopRow;
  dimension: "agent" | "skill";
}) {
  const { isDark } = useTheme();
  const SkillAvatar = getSkillAvatarIcon(row.icon);
  const ModelLogo = row.modelId
    ? getModelLogoByModelId(row.modelId, isDark)
    : undefined;

  return (
    <div className="flex w-64 flex-col gap-3 py-1 text-left">
      <div className="flex min-w-0 items-center gap-2">
        {dimension === "agent" ? (
          <Avatar
            name={row.name}
            visual={row.pictureUrl ?? undefined}
            size="xs"
          />
        ) : (
          <SkillAvatar name={row.name} size="xs" />
        )}
        <span className="truncate text-base font-semibold text-primary-50">
          {row.name}
        </span>
      </div>
      <span className="text-sm leading-5 text-primary-200">
        {row.description}
      </span>
      {dimension === "agent" && row.modelDisplayName && (
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary-50">
            <Icon
              visual={ModelLogo ?? DustLogoSquare}
              size="xs"
              className="text-primary-950"
            />
          </span>
          <span className="text-sm font-medium text-primary-50">
            {row.modelDisplayName}
          </span>
        </div>
      )}
    </div>
  );
}

function buildColumns({
  dimension,
  hasAvatar,
  isAvatarRounded,
  avgLabel,
  totalCredits,
}: {
  dimension: ConsumptionDimension;
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
        const row = info.row.original;
        const { name, pictureUrl, description, icon } = row;
        const SkillAvatar = getSkillAvatarIcon(icon);
        const content =
          dimension === "skill" ? (
            <div className="flex min-w-0 items-center gap-2">
              <SkillAvatar name={name} size="xs" />
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

        return (
          <DataTable.CellContent className="w-full justify-start text-left">
            {description && (dimension === "agent" || dimension === "skill") ? (
              <Tooltip
                label={
                  <AttributionTooltipCard row={row} dimension={dimension} />
                }
                className="p-3"
                tooltipTriggerAsChild
                trigger={content}
              />
            ) : (
              content
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
    limit: TOP_LIMIT,
    filter,
  });

  // Client-side filter over the loaded ranking. A row outside the top
  // TOP_LIMIT will not appear — the endpoint has no server-side search yet.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? allRows.filter((row) => row.name.toLowerCase().includes(needle))
      : allRows;
  }, [allRows, search]);

  const columns = useMemo(
    () =>
      buildColumns({
        dimension,
        hasAvatar,
        isAvatarRounded: dimension === "user",
        avgLabel,
        totalCredits,
      }),
    [hasAvatar, dimension, avgLabel, totalCredits]
  );

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
    const selectedIdSet = new Set(
      filter?.[CONSUMPTION_DIMENSION_FILTER_KEYS[dimension]] ?? []
    );
    const data: AttributionRowData[] = rows.map((row) => ({
      ...row,
      isExpanded: expandedRowId === row.id,
      isFilterSelected: selectedIdSet.has(row.id),
      onClick: () =>
        setExpandedRowId((current) => (current === row.id ? null : row.id)),
      onAddFilter: () => onAddFilter(row),
    }));

    content = (
      <div className="overflow-x-auto">
        <ConsumptionAttributionRowsTable
          data={data}
          columns={columns}
          workspaceId={workspaceId}
          dimension={dimension}
          period={period}
          filter={filter}
          onViewAll={onViewAll}
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

  const exportBody: ConsumptionExportBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
  };

  // Every raw consumption line with no aggregation, for users who want to
  // build their own analysis on top of it.
  const rawCsvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/consumption/export-raw`,
    filename: `dust_consumption_lines_export_${workspaceId}.zip`,
    body: exportBody,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-foreground">Attribution</h3>
        <CsvDownloadButton {...rawCsvDownload} label="Download raw data" />
      </div>
      <div className="rounded-lg border border-border bg-panel-background p-4">
        <div className="flex flex-col gap-3">
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
            className="w-full"
          />
          <div className="relative overflow-hidden">
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
      </div>
    </div>
  );
}
