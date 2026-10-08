import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { WorkspaceAnalyticsTimeRangeSelector } from "@app/components/workspace/analytics/WorkspaceAnalyticsTimeRangeSelector";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SettingsList,
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

  const end = toDateString(new Date());
  // Subtracting whole UTC days keeps the dates exactly `period` days apart, as the server checks;
  // local-time arithmetic gives one extra day around DST changes.
  const start = toDateString(new Date(Date.parse(end) - period * ONE_DAY_MS));

  const csvDownload = useDownloadCsv({
    url: `/api/w/${workspaceId}/analytics/export?table=${table}&startDate=${start}&endDate=${end}`,
    filename: `dust_${table}_${start}_${end}.csv`,
  });

  const selectedTable = EXPORT_TABLES.find(
    (exportTable) => exportTable.value === table
  );
  const selectedLabel = selectedTable ? t(selectedTable.label) : table;

  return (
    <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.analytics.export}>
      <SettingsList>
        <SettingsList.Row
          title={<Trans>Export data</Trans>}
          description={
            <Trans>
              Download analytics for the selected period as a CSV file.
            </Trans>
          }
          action={
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
          }
        />
      </SettingsList>
    </AdminSectionAnchor>
  );
}
