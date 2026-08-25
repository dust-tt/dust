import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { ConsumptionChart } from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionSummary } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { UsageFilterPanel } from "@app/components/workspace/analytics/UsageFilterPanel";
import { UsageFilterSummary } from "@app/components/workspace/analytics/UsageFilterSummary";
import type {
  UsageFilter,
  UsageFilterCategory,
} from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterFromAttributionRow,
  removeUsageFilterFromAttributionRow,
  setUsageFilterFromAttributionRow,
  toConsumptionScopeFilter,
} from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { LightWorkspaceType } from "@app/types/user";
import { Page } from "@dust-tt/sparkle";
import { domMax, LazyMotion, m, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";

export type ScopedConsumptionAnalyticsScope =
  | { type: "agent"; id: string }
  | { type: "skill"; id: string };

const HIDDEN_CATEGORIES_BY_SCOPE: Record<
  ScopedConsumptionAnalyticsScope["type"],
  readonly UsageFilterCategory[]
> = {
  agent: ["agent"],
  skill: ["skill"],
};

interface ScopedConsumptionAnalyticsProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  scope: ScopedConsumptionAnalyticsScope;
  defaultDimension: ConsumptionDimension;
}

export function ScopedConsumptionAnalytics({
  owner,
  period,
  scope,
  defaultDimension,
}: ScopedConsumptionAnalyticsProps) {
  const [dimension, setDimension] =
    useState<ConsumptionDimension>(defaultDimension);
  const [filter, setFilter] = useState<UsageFilter>({});
  const scopeFilter = useMemo(() => toConsumptionScopeFilter(filter), [filter]);
  const shouldReduceMotion = useReducedMotion();
  const agentId = scope.type === "agent" ? scope.id : undefined;
  const skillId = scope.type === "skill" ? scope.id : undefined;

  return (
    <Page.Vertical align="stretch" gap="xl">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">Overview</h3>
        <ConsumptionOverview
          workspaceId={owner.sId}
          period={period}
          agentId={agentId}
          skillId={skillId}
        />
      </div>

      <ConsumptionSummary
        workspaceId={owner.sId}
        period={period}
        agentId={agentId}
        skillId={skillId}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-base font-semibold text-foreground">Explore</h3>
            <UsageFilterPanel
              owner={owner}
              period={period}
              filter={filter}
              agentId={agentId}
              skillId={skillId}
              hiddenCategories={HIDDEN_CATEGORIES_BY_SCOPE[scope.type]}
              onFilterChange={setFilter}
            />
          </div>
          <UsageFilterSummary filter={filter} onFilterChange={setFilter} />
        </div>
        <LazyMotion features={domMax}>
          <m.div
            layout={!shouldReduceMotion}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.18,
            }}
            className="flex flex-col"
          >
            <ConsumptionChart
              workspaceId={owner.sId}
              period={period}
              dimension={dimension}
              filter={scopeFilter}
              agentId={agentId}
              skillId={skillId}
            />
          </m.div>
        </LazyMotion>
      </div>

      <ConsumptionAttributionTable
        workspaceId={owner.sId}
        period={period}
        filter={scopeFilter}
        agentId={agentId}
        skillId={skillId}
        onAddFilter={(selectedRow) => {
          setFilter((current) =>
            addUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
        }}
        onRemoveFilter={(selectedRow) => {
          setFilter((current) =>
            removeUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
        }}
        dimension={dimension}
        onDimensionChange={setDimension}
        onViewAll={(nextDimension, selectedRow) => {
          setFilter((current) =>
            setUsageFilterFromAttributionRow(current, dimension, selectedRow)
          );
          setDimension(nextDimension);
        }}
      />
    </Page.Vertical>
  );
}
