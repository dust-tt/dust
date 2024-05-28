import {
  Button,
  CloudArrowDownIcon,
  DropdownMenu,
  Spinner,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

import { useWorkspaceAnalytics } from "@app/lib/swr";

interface QuickInsightsProps {
  owner: WorkspaceType;
}

export function QuickInsights({ owner }: QuickInsightsProps) {
  const { analytics, isMemberCountLoading } = useWorkspaceAnalytics({
    workspaceId: owner.sId,
    disabled: false,
  });

  if (!analytics) {
    return null;
  }

  return (
    <>
      <div>
        <span className="text-md font-semibold">Quick insights</span>
        {isMemberCountLoading ? (
          <Spinner />
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-gray-100 p-3">
              <h5 className="text-xs font-semibold text-gray-900">Members</h5>
              <h5 className="pt-1 text-xs text-gray-700">Total members</h5>
              <h5 className="text-md pt-2 font-bold text-gray-900">
                {analytics.memberCount}
              </h5>
            </div>
            <div className="rounded-lg bg-gray-100 p-3">
              <h5 className="text-xs font-semibold text-gray-900">
                Active users
              </h5>
              <h5 className="pt-1 text-xs text-gray-700">Daily Active Users</h5>
              <h5 className="text-md pt-2 font-bold text-gray-900">
                {analytics.averageWeeklyDailyActiveUsers.count}
              </h5>
              <h5 className="text-xs text-gray-400">Average on 7 days</h5>
            </div>
            <div className="rounded-lg bg-gray-100 p-3">
              <h5 className="text-xs font-semibold text-gray-900">
                Active Users
              </h5>
              <h5 className="pt-1 text-xs text-gray-700">Last 7 days</h5>
              <div className="grid grid-cols-2 pt-2">
                <div className="text-md font-semibold">
                  {analytics.weeklyActiveUsers.count}
                </div>
                <div className="text-sm font-semibold text-gray-600">
                  {analytics.weeklyActiveUsers.growth >= 0 ? "+" : ""}
                  {Math.floor(analytics.weeklyActiveUsers.growth)}%
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-gray-100 p-3">
              <h5 className="text-xs font-semibold text-gray-900">
                Active Users
              </h5>
              <h5 className="text-xs text-gray-700">Last 30 days</h5>
              <div className="grid grid-cols-2 pt-2">
                <div className="text-md font-semibold">
                  {analytics.monthlyActiveUsers.count}
                </div>
                <div className="text-sm font-semibold text-gray-600">
                  {analytics.monthlyActiveUsers.growth >= 0 ? "+" : ""}
                  {Math.floor(analytics.monthlyActiveUsers.growth)}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
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
        <div>
          <div className="flex flex-col">
            <span className="font-semibold">Full activity report</span>
            <span className="text-sm text-gray-600">
              Download workspace activity details.
            </span>
          </div>
          <div className="align-center mt-2 flex flex-row gap-2 p-2">
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
