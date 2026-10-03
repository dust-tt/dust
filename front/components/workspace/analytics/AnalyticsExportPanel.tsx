import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { WorkspaceAnalyticsTimeRangeSelector } from "@app/components/workspace/analytics/WorkspaceAnalyticsTimeRangeSelector";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

type ExportTable =
  | "usage_metrics"
  | "active_users"
  | "source"
  | "agents"
  | "users"
  | "skills"
  | "skill_usage"
  | "tool_usage"
  | "messages"
  | "feedback";

const EXPORT_TABLES: { value: ExportTable; label: MessageDescriptor }[] = [
  { value: "usage_metrics", label: msg`Usage metrics` },
  { value: "active_users", label: msg`Active users` },
  { value: "source", label: msg`Message source` },
  { value: "agents", label: msg`Agents` },
  { value: "users", label: msg`Users` },
  { value: "skills", label: msg`Skills` },
  { value: "skill_usage", label: msg`Skill usage` },
  { value: "tool_usage", label: msg`Tool usage` },
  { value: "messages", label: msg`Messages` },
  { value: "feedback", label: msg`Feedback` },
];

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface AnalyticsExportPanelProps {
  workspaceId: string;
}

export function AnalyticsExportPanel({
  workspaceId,
}: AnalyticsExportPanelProps) {
  const { t } = useLingui();
  // Dedicated period, independent from the page-level time range selector.
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);
  const [table, setTable] = useState<ExportTable>("usage_metrics");

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const start = toDateString(startDate);
  const end = toDateString(endDate);

  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/export?table=${table}&startDate=${start}&endDate=${end}`,
    filename: `dust_${table}_${start}_${end}.csv`,
  });

  const selectedTable = EXPORT_TABLES.find(
    (exportTable) => exportTable.value === table
  );
  const selectedLabel = selectedTable ? t(selectedTable.label) : table;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-foreground">
            <Trans>Export data</Trans>
          </h3>
          <p className="text-xs text-muted-foreground">
            <Trans>
              Download analytics for the selected period as a CSV file.
            </Trans>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WorkspaceAnalyticsTimeRangeSelector
            period={period}
            onPeriodChange={setPeriod}
          />
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
              {EXPORT_TABLES.map((exportTable) => (
                <DropdownMenuItem
                  key={exportTable.value}
                  label={t(exportTable.label)}
                  onClick={() => setTable(exportTable.value)}
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
