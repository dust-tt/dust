import type {
  AnalyticsScopeDimension,
  AnalyticsScopeFilter,
} from "@app/lib/api/analytics/awu_usage_analytics";

export type { AnalyticsScopeDimension, AnalyticsScopeFilter };

export interface AnalyticsEntityFilter {
  id: string;
  name: string;
}

export type AnalyticsFilter = Partial<
  Record<AnalyticsScopeDimension, AnalyticsEntityFilter[]>
>;

export const SCOPE_DIMENSION_LABEL: Record<AnalyticsScopeDimension, string> = {
  agent: "Agent",
  user: "User",
  origin: "Source",
};

export const SCOPE_DIMENSIONS = Object.keys(
  SCOPE_DIMENSION_LABEL
) as AnalyticsScopeDimension[];

export function isScopeDimension(
  groupBy: string | undefined
): groupBy is AnalyticsScopeDimension {
  return groupBy !== undefined && groupBy in SCOPE_DIMENSION_LABEL;
}

export function scopeFilterToIds(
  filter: AnalyticsFilter
): AnalyticsScopeFilter {
  const ids: AnalyticsScopeFilter = {};
  for (const dimension of SCOPE_DIMENSIONS) {
    const entities = filter[dimension];
    if (entities && entities.length > 0) {
      ids[dimension] = entities.map((entity) => entity.id);
    }
  }
  return ids;
}

export function toggleScopeEntity(
  filter: AnalyticsFilter,
  dimension: AnalyticsScopeDimension,
  entity: AnalyticsEntityFilter
): AnalyticsFilter {
  const current = filter[dimension] ?? [];
  const next = current.some((e) => e.id === entity.id)
    ? current.filter((e) => e.id !== entity.id)
    : [...current, entity];
  return { ...filter, [dimension]: next.length > 0 ? next : undefined };
}

export function removeScopeEntity(
  filter: AnalyticsFilter,
  dimension: AnalyticsScopeDimension,
  id: string
): AnalyticsFilter {
  const next = (filter[dimension] ?? []).filter((e) => e.id !== id);
  return { ...filter, [dimension]: next.length > 0 ? next : undefined };
}
