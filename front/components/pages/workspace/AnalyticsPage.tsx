import { BarChartIcon, Page } from "@dust-tt/sparkle";
import { useState } from "react";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { ActivityReport } from "@app/components/workspace/ActivityReport";
import { WorkspaceAnalyticsOverviewCards } from "@app/components/workspace/analytics/WorkspaceAnalyticsOverviewCards";
import { WorkspaceAnalyticsTimeRangeSelector } from "@app/components/workspace/analytics/WorkspaceAnalyticsTimeRangeSelector";
import { WorkspaceSourceChart } from "@app/components/workspace/analytics/WorkspaceSourceChart";
import { WorkspaceToolUsageChart } from "@app/components/workspace/analytics/WorkspaceToolUsageChart";
import { WorkspaceTopAgentsTable } from "@app/components/workspace/analytics/WorkspaceTopAgentsTable";
import { WorkspaceTopUsersTable } from "@app/components/workspace/analytics/WorkspaceTopUsersTable";
import { WorkspaceUsageChart } from "@app/components/workspace/analytics/WorkspaceUsageChart";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useWorkspaceSubscriptions } from "@app/lib/swr/workspaces";
import datadogLogger from "@app/logger/datadogLogger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export function AnalyticsPage() {
  const owner = useWorkspace();
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);

  const { subscriptions } = useWorkspaceSubscriptions({
    owner,
  });

  const handleDownload = async (selectedMonth: string | null) => {
    if (!selectedMonth) {
      return;
    }

    const queryParams = new URLSearchParams({
      mode: "month",
      start: selectedMonth,
      table: "all",
    });
    if (includeInactive) {
      queryParams.set("includeInactive", "true");
    }

    setDownloadingMonth(selectedMonth);
    try {
      const response = await clientFetch(
        `/api/w/${owner.sId}/workspace-usage?${queryParams.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const contentType = response.headers.get("Content-Type");
      const isZip = contentType === "application/zip";

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const [year, month] = selectedMonth.split("-");

      const getMonthName = (monthIndex: number) => {
        const months = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ];
        return months[monthIndex - 1];
      };

      const monthName = getMonthName(Number(month));

      const fileExtension = isZip ? "zip" : "csv";
      const filename = `dust_${owner.name}_activity_${year}_${monthName}.${fileExtension}`;

      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      const normalizedError = normalizeError(error);
      datadogLogger.error(
        {
          error: normalizedError.message,
          workspaceId: owner.sId,
          month: selectedMonth,
        },
        "[Analytics] Failed to download activity data"
      );
      alert("Failed to download activity data.");
    } finally {
      setDownloadingMonth(null);
    }
  };

  const monthOptions: string[] = [];

  if (subscriptions.length > 0) {
    const oldestStartDate = subscriptions.reduce(
      (oldest, current) => {
        if (!current.startDate) {
          return oldest;
        }
        if (!oldest) {
          return new Date(current.startDate);
        }
        return new Date(current.startDate) < oldest
          ? new Date(current.startDate)
          : oldest;
      },
      null as Date | null
    );

    if (oldestStartDate) {
      const startDateYear = oldestStartDate.getFullYear();
      const startDateMonth = oldestStartDate.getMonth();

      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();

      for (let year = currentYear; year >= startDateYear; year--) {
        const startMonth = year === startDateYear ? startDateMonth : 0;
        const endMonth = year === currentYear ? currentMonth : 11;
        for (let month = endMonth; month >= startMonth; month--) {
          monthOptions.push(`${year}-${String(month + 1).padStart(2, "0")}`);
        }
      }
    }
  }

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title={
          <div className="flex flex-row w-full justify-between">
            <div>
              <Page.H variant="h3">Analytics</Page.H>
            </div>
            <div>
              <WorkspaceAnalyticsTimeRangeSelector
                period={period}
                onPeriodChange={setPeriod}
              />
            </div>
          </div>
        }
        icon={BarChartIcon}
        description="Track how your team uses Dust"
      />
      <WorkspaceAnalyticsOverviewCards
        workspaceId={owner.sId}
        period={period}
      />
      <WorkspaceUsageChart workspaceId={owner.sId} period={period} />
      <WorkspaceSourceChart workspaceId={owner.sId} period={period} />
      <WorkspaceToolUsageChart workspaceId={owner.sId} period={period} />
      <WorkspaceTopUsersTable workspaceId={owner.sId} period={period} />
      <WorkspaceTopAgentsTable workspaceId={owner.sId} period={period} />
      <ActivityReport
        downloadingMonth={downloadingMonth}
        monthOptions={monthOptions}
        handleDownload={handleDownload}
        includeInactive={includeInactive}
        onIncludeInactiveChange={setIncludeInactive}
      />
    </Page.Vertical>
  );
}
