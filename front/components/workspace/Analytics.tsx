import {
  Button,
  ContextItem,
  GoogleSpreadsheetLogo,
  Icon,
  Page,
  Pagination,
  Spinner,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { useWorkspaceAnalytics } from "@app/lib/swr";

interface QuickInsightsProps {
  owner: WorkspaceType;
}

interface InsightCardProps {
  title: string;
  subtitle: string;
  value1: string | number;
  value2?: string | number;
  metric?: string;
}

function InsightCard({
  title,
  subtitle,
  value1,
  value2,
  metric,
}: InsightCardProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-structure-50 p-4 text-element-800">
      <h5 className="text-sm font-semibold">{title}</h5>
      <h5 className="text-sm text-element-700">{subtitle}</h5>
      <div className="text-md grid grid-cols-2 pt-2 font-semibold">
        <div>{value1}</div>
        {value2 && <div>{value2}</div>}
      </div>
      {metric && <h5 className="text-sm text-element-700">{metric}</h5>}
    </div>
  );
}

export function QuickInsights({ owner }: QuickInsightsProps) {
  const { analytics, isMemberCountLoading } = useWorkspaceAnalytics({
    workspaceId: owner.sId,
    disabled: false,
  });

  return (
    <div className="flex flex-grow flex-col gap-1">
      <Page.H variant="h6">Quick insights</Page.H>
      {!analytics || isMemberCountLoading ? (
        <div className="flex h-full min-h-28 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <InsightCard
            title="Members"
            subtitle="Total members"
            value1={analytics.memberCount}
          />
          <InsightCard
            title="Active users"
            subtitle="Daily Active Users"
            value1={analytics.averageWeeklyDailyActiveUsers.count}
            metric="Average on 7 days"
          />
          <InsightCard
            title="Active Users"
            subtitle="Last 7 days"
            value1={analytics.weeklyActiveUsers.count}
            value2={`${
              analytics.weeklyActiveUsers.growth >= 0 ? "+" : ""
            }${Math.floor(analytics.weeklyActiveUsers.growth)}%`}
          />
          <InsightCard
            title="Active Users"
            subtitle="Last 30 days"
            value1={analytics.monthlyActiveUsers.count}
            value2={`${
              analytics.monthlyActiveUsers.growth >= 0 ? "+" : ""
            }${Math.floor(analytics.monthlyActiveUsers.growth)}%`}
          />
        </div>
      )}
    </div>
  );
}

interface ActivityReportProps {
  monthOptions: string[];
  isLoading: boolean;
  handleDownload: (selectedMonth: string | null) => void;
}

export function ActivityReport({
  monthOptions,
  isLoading,
  handleDownload,
}: ActivityReportProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const toPrettyDate = (date: string) => {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const [year, monthIndex] = date.split("-");
    return `${months.at(Number(monthIndex) - 1)} ${year} `;
  };

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = monthOptions.slice(startIndex, endIndex);
  return (
    <>
      {!!monthOptions.length && (
        <div className="flex-grow">
          <div className="flex flex-col gap-3">
            <Page.H variant="h6">Full activity report</Page.H>
            <Page.P variant="secondary">
              Download workspace activity details.
            </Page.P>
          </div>
          <div className="flex h-full flex-col">
            <ContextItem.List>
              {currentItems.map((item, index) => (
                <ContextItem
                  key={index}
                  title={toPrettyDate(item)}
                  visual={<Icon visual={GoogleSpreadsheetLogo} size="sm" />}
                  action={
                    <Button
                      icon={DownloadIcon}
                      variant="tertiary"
                      size="xs"
                      label="Download"
                      labelVisible={false}
                      onClick={() => {
                        handleDownload(item);
                      }}
                      disabled={isLoading}
                    />
                  }
                ></ContextItem>
              ))}
            </ContextItem.List>
            <div className="mt-2">
              <Pagination
                itemsCount={monthOptions.length}
                maxItemsPerPage={itemsPerPage}
                onButtonClick={handlePageChange}
                size="xs"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
