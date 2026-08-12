import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { normalizedConsumptionFilter } from "@app/lib/analytics/consumption_period";
import type { ConsumptionTopBody } from "@app/lib/api/analytics/consumption/schema";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/api/analytics/consumption/schema";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionTopResponse,
  ConsumptionTopRow,
} from "@app/lib/api/analytics/consumption/top_rows";
import { toConsumptionTopRows } from "@app/lib/api/analytics/consumption/top_rows";
import { emptyArray } from "@app/lib/swr/swr";
import { useMemo } from "react";

export type { ConsumptionTopRow };

const CONSUMPTION_TOP_ENDPOINTS = {
  agent: "top-agents",
  user: "top-users",
  group: "top-groups",
  model: "top-models",
  tool: "top-tools",
  skill: "top-skills",
  source: "top-sources",
} as const satisfies Record<ConsumptionDimension, string>;

export function useConsumptionTop({
  workspaceId,
  dimension,
  period,
  limit,
  filter,
  disabled,
}: {
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  limit: number;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/analytics/consumption/${CONSUMPTION_TOP_ENDPOINTS[dimension]}`;
  const body: ConsumptionTopBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
    limit,
  };

  const { data, error, isValidating } = useConsumptionQuery<
    ConsumptionTopBody,
    ConsumptionTopResponse
  >({ url, body, disabled });

  const rows = useMemo(
    () => (data ? toConsumptionTopRows(data) : emptyArray<ConsumptionTopRow>()),
    [data]
  );

  return {
    rows,
    // Everything the workspace consumed over the period, so a row's share of it
    // is `credits / totalCredits`.
    totalCredits: data?.totalCredits ?? 0,
    isTopLoading: !error && !data && !disabled,
    isTopError: error,
    isTopValidating: isValidating,
  };
}
