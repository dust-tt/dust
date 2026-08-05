import type { ConsumptionPeriodSelection } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import { AvatarNameCell } from "@app/components/workspace/analytics/creditsTableCells";
import type {
  ConsumptionTopDimension,
  ConsumptionTopRow,
} from "@app/hooks/useConsumptionTop";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import { useDebounce } from "@app/hooks/useDebounce";
import { formatCredits } from "@app/lib/client/credits";
import {
  cn,
  DataTable,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

// The rankings this table can show, one tab per `top-*` endpoint. Tools and
// skills average their cost over invocations rather than messages: a single
// message can call the same tool many times, so a per-message figure would say
// nothing about the tool itself.
const DIMENSION_TABS: {
  dimension: ConsumptionTopDimension;
  label: string;
  // Agents and users have a picture; the rest are labels only.
  hasAvatar: boolean;
  avgLabel: string;
}[] = [
  {
    dimension: "agent",
    label: "Agents",
    hasAvatar: true,
    avgLabel: "Cost / message",
  },
  {
    dimension: "user",
    label: "Members",
    hasAvatar: true,
    avgLabel: "Cost / message",
  },
  {
    dimension: "model",
    label: "Models",
    hasAvatar: false,
    avgLabel: "Cost / message",
  },
  {
    dimension: "tool",
    label: "Tools",
    hasAvatar: false,
    avgLabel: "Cost / invocation",
  },
  {
    dimension: "skill",
    label: "Skills",
    hasAvatar: false,
    avgLabel: "Cost / invocation",
  },
  {
    dimension: "source",
    label: "Sources",
    hasAvatar: false,
    avgLabel: "Cost / message",
  },
];

// Enough to make the per-tab search useful without paging; the table shows a
// ranking, not the full population.
const TOP_LIMIT = 25;

// DataTable requires its optional row-interaction fields on the row shape.
// No row action here yet — expandable rows and the row-to-chart drilldown come
// in later branches.
type AttributionRowData = ConsumptionTopRow & {
  onClick?: () => void;
  onDoubleClick?: () => void;
};

function CostShareCell({ share }: { share: number }) {
  const percent = Math.round(share * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

function buildColumns({
  hasAvatar,
  avgLabel,
  totalCredits,
}: {
  hasAvatar: boolean;
  avgLabel: string;
  totalCredits: number;
}): ColumnDef<AttributionRowData>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      meta: { sizeRatio: 34 },
      cell: (info) => {
        const { name, pictureUrl } = info.row.original;
        return (
          <DataTable.CellContent>
            {hasAvatar ? (
              <AvatarNameCell name={name} imageUrl={pictureUrl} />
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
      meta: { sizeRatio: 22 },
      cell: (info) => (
        <DataTable.CellContent>
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
      meta: { sizeRatio: 22 },
      cell: (info) => (
        <DataTable.BasicCellContent
          label={formatCredits(info.row.original.credits)}
        />
      ),
    },
    {
      id: "avgCredits",
      accessorKey: "avgCredits",
      header: avgLabel,
      meta: { sizeRatio: 22 },
      cell: (info) => (
        <DataTable.BasicCellContent
          label={formatCredits(info.row.original.avgCredits)}
        />
      ),
    },
  ];
}

interface AttributionRowsProps {
  workspaceId: string;
  dimension: ConsumptionTopDimension;
  hasAvatar: boolean;
  avgLabel: string;
  period: ConsumptionPeriodSelection;
  search: string;
}

function AttributionRows({
  workspaceId,
  dimension,
  hasAvatar,
  avgLabel,
  period,
  search,
}: AttributionRowsProps) {
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
    () => buildColumns({ hasAvatar, avgLabel, totalCredits }),
    [hasAvatar, avgLabel, totalCredits]
  );

  if (isTopLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (isTopError) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load attribution.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {search.trim()
          ? `No match for "${search.trim()}".`
          : "No consumption over this period."}
      </div>
    );
  }

  return (
    <div className="[&_tbody_tr:last-child]:border-b-0">
      <DataTable<AttributionRowData> data={rows} columns={columns} />
    </div>
  );
}

function isConsumptionTopDimension(
  value: string
): value is ConsumptionTopDimension {
  return DIMENSION_TABS.some((tab) => tab.dimension === value);
}

interface ConsumptionAttributionTableProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
}

export function ConsumptionAttributionTable({
  workspaceId,
  period,
}: ConsumptionAttributionTableProps) {
  const [dimension, setDimension] = useState<ConsumptionTopDimension>("agent");
  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: 300,
  });

  const activeTab = DIMENSION_TABS.find((tab) => tab.dimension === dimension);

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4")}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="text-base font-medium text-foreground">Attribution</h3>
        <SearchInput
          name="consumption-attribution-search"
          placeholder="Search…"
          value={inputValue}
          onChange={setValue}
          className="w-64"
        />
      </div>
      <Tabs
        value={dimension}
        onValueChange={(value) => {
          if (isConsumptionTopDimension(value)) {
            setDimension(value);
          }
        }}
      >
        <TabsList border>
          {DIMENSION_TABS.map((tab) => (
            <TabsTrigger
              key={tab.dimension}
              value={tab.dimension}
              label={tab.label}
            />
          ))}
        </TabsList>
      </Tabs>
      <div className="pt-3">
        <AttributionRows
          workspaceId={workspaceId}
          dimension={dimension}
          hasAvatar={activeTab?.hasAvatar ?? false}
          avgLabel={activeTab?.avgLabel ?? "Cost / message"}
          period={period}
          search={debouncedValue}
        />
      </div>
    </div>
  );
}
