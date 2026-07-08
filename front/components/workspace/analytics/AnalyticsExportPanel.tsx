import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { WorkspaceAnalyticsTimeRangeSelector } from "@app/components/workspace/analytics/WorkspaceAnalyticsTimeRangeSelector";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NewButton,
} from "@dust-tt/sparkle";
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

const EXPORT_TABLES: { value: ExportTable; label: string }[] = [
  { value: "usage_metrics", label: "Usage metrics" },
  { value: "active_users", label: "Active users" },
  { value: "source", label: "Message source" },
  { value: "agents", label: "Agents" },
  { value: "users", label: "Users" },
  { value: "skills", label: "Skills" },
  { value: "skill_usage", label: "Skill usage" },
  { value: "tool_usage", label: "Tool usage" },
  { value: "messages", label: "Messages" },
  { value: "feedback", label: "Feedback" },
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

  const selectedLabel =
    EXPORT_TABLES.find((t) => t.value === table)?.label ?? table;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Export data</h3>
          <p className="text-xs text-muted-foreground">
            Download analytics for the selected period as a CSV file.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WorkspaceAnalyticsTimeRangeSelector
            period={period}
            onPeriodChange={setPeriod}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <NewButton
                label={selectedLabel}
                size="xs"
                variant="outline"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {EXPORT_TABLES.map((t) => (
                <DropdownMenuItem
                  key={t.value}
                  label={t.label}
                  onClick={() => setTable(t.value)}
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
