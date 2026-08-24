import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  CONSUMPTION_DIMENSION_CONFIG,
  CONSUMPTION_DIMENSIONS,
  DEFAULT_CONSUMPTION_DIMENSION,
} from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface ConsumptionExportDataPanelProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
}

export function ConsumptionExportDataPanel({
  workspaceId,
  period,
  filter,
}: ConsumptionExportDataPanelProps) {
  const [dimension, setDimension] = useState<ConsumptionDimension>(
    DEFAULT_CONSUMPTION_DIMENSION
  );

  const body = useMemo(
    () => ({
      period: period.kind,
      days:
        period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
      filter: normalizedConsumptionFilter(filter),
      dimension,
    }),
    [period, filter, dimension]
  );

  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/consumption/export-table`,
    filename: `dust_consumption_${dimension}.csv`,
    body,
  });

  const selectedLabel = CONSUMPTION_DIMENSION_CONFIG[dimension].label;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Export data</h3>
          <p className="text-xs text-muted-foreground">
            Download the attribution table for the selected period as a CSV
            file.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={selectedLabel}
                size="xs"
                variant="outline"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {CONSUMPTION_DIMENSIONS.map((d) => (
                <DropdownMenuItem
                  key={d}
                  label={CONSUMPTION_DIMENSION_CONFIG[d].label}
                  onClick={() => setDimension(d)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <CsvDownloadButton {...csvDownload} />
        </div>
      </div>
    </div>
  );
}
