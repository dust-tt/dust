import type {
  ConsumptionAttributionBreakdownColumnProps,
  ConsumptionAttributionBreakdownProps,
} from "@app/components/workspace/analytics/consumption/ConsumptionAttributionBreakdown";
import {
  CONSUMPTION_ATTRIBUTION_BREAKDOWN_LIMIT,
  ConsumptionAttributionBreakdownColumnView,
  ConsumptionAttributionBreakdownView,
} from "@app/components/workspace/analytics/consumption/ConsumptionAttributionBreakdown";
import type { ConsumptionAttributionRowsTableProps } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionRowsTable";
import { ConsumptionAttributionRowsTableView } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionRowsTable";
import type {
  ConsumptionAttributionRowsProps,
  ConsumptionAttributionTableProps,
} from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import {
  ConsumptionAttributionRowsView,
  ConsumptionAttributionTableView,
  useConsumptionAttributionRowsQueryState,
} from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { usePokeConsumptionTop } from "@app/poke/swr/consumption";

function PokeConsumptionAttributionBreakdownColumn({
  workspaceId,
  dimension,
  period,
  filter,
  selectedRowName,
  onViewAll,
}: ConsumptionAttributionBreakdownColumnProps) {
  const { rows, totalCredits, isTopLoading, isTopError } =
    usePokeConsumptionTop({
      workspaceId,
      dimension,
      period,
      limit: CONSUMPTION_ATTRIBUTION_BREAKDOWN_LIMIT,
      filter,
    });

  return (
    <ConsumptionAttributionBreakdownColumnView
      dimension={dimension}
      selectedRowName={selectedRowName}
      onViewAll={onViewAll}
      rows={rows}
      totalCredits={totalCredits}
      isTopLoading={isTopLoading}
      isTopError={Boolean(isTopError)}
    />
  );
}

function PokeConsumptionAttributionBreakdown(
  props: ConsumptionAttributionBreakdownProps
) {
  return (
    <ConsumptionAttributionBreakdownView
      {...props}
      BreakdownColumnComponent={PokeConsumptionAttributionBreakdownColumn}
    />
  );
}

function PokeConsumptionAttributionRowsTable(
  props: ConsumptionAttributionRowsTableProps
) {
  return (
    <ConsumptionAttributionRowsTableView
      {...props}
      BreakdownComponent={PokeConsumptionAttributionBreakdown}
    />
  );
}

function PokeConsumptionAttributionRows(
  props: ConsumptionAttributionRowsProps
) {
  const queryState = useConsumptionAttributionRowsQueryState();
  const isFiltered = Object.values(props.filter ?? {}).some(
    (values) => values.length > 0
  );
  const {
    rows,
    totalCredits,
    totalActiveMembers,
    totalCount,
    isTopLoading,
    isTopError,
    isTopValidating,
  } = usePokeConsumptionTop({
    workspaceId: props.workspaceId,
    dimension: props.dimension,
    period: props.period,
    limit: queryState.pagination.pageSize,
    offset: queryState.pagination.pageIndex * queryState.pagination.pageSize,
    search: props.search,
    filter: props.filter,
    sortBy: queryState.sortBy,
    sortOrder: queryState.sortOrder,
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
      emptyMessage={
        isFiltered
          ? "No consumption matches the current filters."
          : "No consumption over this period."
      }
      queryState={queryState}
      RowsTableComponent={PokeConsumptionAttributionRowsTable}
    />
  );
}

export function PokeConsumptionAttributionTable(
  props: ConsumptionAttributionTableProps
) {
  return (
    <ConsumptionAttributionTableView
      {...props}
      AttributionRowsComponent={PokeConsumptionAttributionRows}
    />
  );
}
