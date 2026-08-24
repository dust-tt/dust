import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import { ConsumptionChart } from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import { ConsumptionSummary } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { DEFAULT_CONSUMPTION_DIMENSION } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { UsageFilterPanel } from "@app/components/workspace/analytics/UsageFilterPanel";
import { UsageFilterSummary } from "@app/components/workspace/analytics/UsageFilterSummary";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterFromAttributionRow,
  removeUsageFilterFromAttributionRow,
  setUsageFilterFromAttributionRow,
  toConsumptionScopeFilter,
} from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DialogClose,
  DialogHeader,
  DialogTitle,
  Page,
  XClose,
} from "@dust-tt/sparkle";
import { domMax, LazyMotion, m, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";

interface UserAnalyticsPopoverProps {
  open: boolean;
  owner: WorkspaceType;
}

export function UserAnalyticsPopover({
  open,
  owner,
}: UserAnalyticsPopoverProps) {
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const [dimension, setDimension] = useState<ConsumptionDimension>(
    DEFAULT_CONSUMPTION_DIMENSION
  );
  const [filter, setFilter] = useState<UsageFilter>({});
  const scopeFilter = useMemo(() => toConsumptionScopeFilter(filter), [filter]);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DialogHeader hideButton className="p-5 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="flex min-w-0 flex-col gap-1 overflow-hidden">
            <DialogTitle className="heading-2xl">Analytics</DialogTitle>
            <ConsumptionOverview
              workspaceId={owner.sId}
              period={period}
              personal
              disabled={!open}
            />
          </div>
          <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <ConsumptionPeriodSelector
              period={period}
              onPeriodChange={setPeriod}
            />
          </div>
          <DialogClose asChild>
            <Button
              className="col-start-2 row-start-1 sm:col-start-3"
              variant="ghost"
              size="mini"
              icon={XClose}
              aria-label="Close analytics"
            />
          </DialogClose>
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 sm:px-6">
        <Page.Vertical align="stretch" gap="xl">
          <ConsumptionSummary
            workspaceId={owner.sId}
            period={period}
            personal
            disabled={!open}
          />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Explore
                </h2>
                <UsageFilterPanel
                  owner={owner}
                  period={period}
                  filter={filter}
                  personal
                  onFilterChange={setFilter}
                  showMemberGroupFilter={false}
                />
              </div>
              <UsageFilterSummary filter={filter} onFilterChange={setFilter} />
            </div>
            <LazyMotion features={domMax}>
              <m.div
                layout={!shouldReduceMotion}
                transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                className="flex flex-col"
              >
                <ConsumptionChart
                  workspaceId={owner.sId}
                  period={period}
                  dimension={dimension}
                  filter={scopeFilter}
                  personal
                  disabled={!open}
                />
              </m.div>
            </LazyMotion>
          </div>

          <ConsumptionAttributionTable
            workspaceId={owner.sId}
            period={period}
            filter={scopeFilter}
            personal
            disabled={!open}
            onAddFilter={(selectedRow) => {
              setFilter((current) =>
                addUsageFilterFromAttributionRow(
                  current,
                  dimension,
                  selectedRow
                )
              );
            }}
            onRemoveFilter={(selectedRow) => {
              setFilter((current) =>
                removeUsageFilterFromAttributionRow(
                  current,
                  dimension,
                  selectedRow
                )
              );
            }}
            dimension={dimension}
            onDimensionChange={setDimension}
            onViewAll={(nextDimension, selectedRow) => {
              setFilter((current) =>
                setUsageFilterFromAttributionRow(
                  current,
                  dimension,
                  selectedRow
                )
              );
              setDimension(nextDimension);
            }}
          />
        </Page.Vertical>
      </div>
    </div>
  );
}
