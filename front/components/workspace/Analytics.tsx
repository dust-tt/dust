import {
  Button,
  CloudArrowDownIcon,
  DropdownMenu,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

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
  selectedMonth: string | null;
  handleSelectedMonth: (month: string) => void;
  isLoading: boolean;
  handleDownload: (selectedMonth: string | null) => void;
}

export function ActivityReport({
  monthOptions,
  selectedMonth,
  handleSelectedMonth,
  isLoading,
  handleDownload,
}: ActivityReportProps) {
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
          <div className="align-center mt-2 flex flex-row gap-2">
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  type="select"
                  labelVisible={true}
                  label={selectedMonth || ""}
                  variant="secondary"
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topLeft">
                {monthOptions.map((month) => (
                  <DropdownMenu.Item
                    key={month}
                    label={month}
                    onClick={() => handleSelectedMonth(month)}
                  />
                ))}
              </DropdownMenu.Items>
            </DropdownMenu>
            <Button
              label={isLoading ? "Loading..." : "Download activity data"}
              icon={CloudArrowDownIcon}
              variant="primary"
              disabled={isLoading}
              onClick={() => {
                void handleDownload(selectedMonth);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
