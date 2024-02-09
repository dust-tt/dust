import {
  Button,
  CloudArrowDownIcon,
  DropdownMenu,
  Input,
  Modal,
  Page,
  PlanetIcon,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession } from "@app/lib/auth";
import { useWorkspaceAnalytics } from "@app/lib/swr";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withGetServerSidePropsLogging<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  gaTrackingId: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isAdmin() || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function WorkspaceAdmin({
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);

  const [showMetricsModal, setShowMetricsModal] = useState(false);

  const formValidation = useCallback(() => {
    if (workspaceName === owner.name) {
      return false;
    }
    let valid = true;

    if (workspaceName.length === 0) {
      setWorkspaceNameError("");
      valid = false;
      // eslint-disable-next-line no-useless-escape
    } else if (!workspaceName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setWorkspaceNameError(
        "Workspace name must only contain letters, numbers, and the characters `._-`"
      );
      valid = false;
    } else {
      setWorkspaceNameError("");
    }
    return valid;
  }, [owner.name, workspaceName]);

  useEffect(() => {
    setDisabled(!formValidation());
  }, [workspaceName, formValidation]);

  const handleUpdateWorkspace = async () => {
    setUpdating(true);
    const res = await fetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: workspaceName,
      }),
    });
    if (!res.ok) {
      window.alert("Failed to update workspace.");
      setUpdating(false);
    } else {
      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  };

  const handleSelectMonth = (selectedOption: string) => {
    setSelectedMonth(selectedOption);
  };

  const handleDownload = async (selectedMonth: string | null) => {
    if (!selectedMonth) {
      return;
    }

    const queryString =
      selectedMonth === "All Time"
        ? "mode=all"
        : `mode=month&start=${selectedMonth}`;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/w/${owner.sId}/workspace-usage?${queryString}`
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const csvData = await response.text();
      const blob = new Blob([csvData], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);

      const [year, month] = selectedMonth.split("-");

      const currentDay = new Date().getDate();
      const formattedDay = String(currentDay).padStart(2, "0");

      const currentMonth = new Date().getMonth() + 1;

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
      const currentMonthName = getMonthName(currentMonth);

      let filename = "";

      if (selectedMonth === "All Time") {
        filename = `dust_${owner.name}_activity_until_${new Date()
          .toISOString()
          .substring(0, 10)}`;
      } else {
        filename = `dust_${owner.name}_activity_${year}_${monthName}`;

        // If the selected month is the current month, append the day
        if (monthName === currentMonthName) {
          filename += `_until_${formattedDay}`;
        }
      }

      filename += ".csv";

      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      alert("Failed to download activity data.");
    } finally {
      setIsLoading(false);
    }
  };

  const monthOptions: string[] = [];

  // This is not perfect as workspaces who were on multiple paid plans will have the list of months only for the current plan.
  // We're living with it until it's a problem.
  if (subscription.startDate) {
    const startDate = new Date(subscription.startDate);
    const startDateYear = startDate.getFullYear();
    const startDateMonth = startDate.getMonth();

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    for (let year = startDateYear; year <= currentYear; year++) {
      const startMonth = year === startDateYear ? startDateMonth : 0;
      const endMonth = year === currentYear ? currentMonth : 11;
      for (let month = startMonth; month <= endMonth; month++) {
        monthOptions.push(`${year}-${String(month + 1).padStart(2, "0")}`);
      }
    }

    monthOptions.push("All Time");

    if (!selectedMonth) {
      setSelectedMonth(monthOptions[monthOptions.length - 1]);
    }
  }

  return (
    <>
      <WorkspaceMetricsModal
        show={showMetricsModal}
        onClose={() => {
          setShowMetricsModal(false);
        }}
        workspaceId={owner.sId}
      />
      <AppLayout
        subscription={subscription}
        owner={owner}
        gaTrackingId={gaTrackingId}
        topNavigationCurrent="admin"
        subNavigation={subNavigationAdmin({ owner, current: "workspace" })}
      >
        <Page.Vertical align="stretch" gap="xl">
          <Page.Header
            title="Workspace Settings"
            icon={PlanetIcon}
            description="Manage your workspace settings."
          />
          <Page.SectionHeader
            title="Workspace name"
            description="Think GitHub repository names, short and memorable."
          />
          <Page.Horizontal>
            <div className="flex-grow">
              <Input
                name="name"
                placeholder="Workspace name"
                value={workspaceName}
                onChange={(x) => setWorkspaceName(x)}
                error={workspaceNameError}
                showErrorLabel={true}
              />
            </div>
            <Button
              variant="secondary"
              disabled={disable || updating}
              onClick={handleUpdateWorkspace}
              label={updating ? "Updating..." : "Update"}
            />
          </Page.Horizontal>

          {!!monthOptions.length && (
            <>
              <Page.SectionHeader
                title="Workspace Activity"
                description="Download workspace activity details."
              />
              <div className="align-center flex flex-row gap-2">
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
                        onClick={() => handleSelectMonth(month)}
                      />
                    ))}
                  </DropdownMenu.Items>
                </DropdownMenu>
                <Button
                  label={isLoading ? "Loading..." : "Download activity data"}
                  icon={CloudArrowDownIcon}
                  variant="secondary"
                  disabled={isLoading}
                  onClick={() => {
                    void handleDownload(selectedMonth);
                  }}
                />
              </div>
              {owner.flags.includes("workspace_analytics") && (
                <div className="align-center flex flex-col gap-6">
                  <Page.SectionHeader
                    title="Workspace Analytics"
                    description="View some metrics about your workspace overall."
                  />
                  <div>
                    <Button
                      label="View Metrics"
                      onClick={() => {
                        setShowMetricsModal(true);
                      }}
                      size="sm"
                      variant="secondary"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </Page.Vertical>
      </AppLayout>
    </>
  );
}

function WorkspaceMetricsModal({
  show,
  onClose,
  workspaceId,
}: {
  show: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const { analytics } = useWorkspaceAnalytics({ workspaceId, disabled: !show });
  if (!analytics) {
    return null;
  }

  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      hasChanged={false}
      title="Workspace Analytics"
    >
      <div className="mt-8 divide-y divide-gray-200">
        <div className="grid grid-cols-2 items-center gap-x-4 pb-4">
          <span className="text-left font-bold text-element-900">
            # Members:
          </span>
          <span className="font-semibold text-element-700">
            {analytics.memberCount}
          </span>
        </div>
        <div className="grid grid-cols-2 items-center gap-x-4 py-4">
          <span className="text-left font-bold text-element-900">
            Last 7 days Active Users:
          </span>
          <span className="font-semibold text-element-700">
            {analytics.weeklyActiveUsers.count} (
            {analytics.weeklyActiveUsers.growth >= 0 ? "+" : ""}
            {analytics.weeklyActiveUsers.growth}% WoW)
          </span>
        </div>
        <div className="grid grid-cols-2 items-center gap-x-4 pt-4">
          <span className="text-left font-bold text-element-900">
            Last 30 days Active Users:
          </span>
          <span className="font-semibold text-element-700">
            {analytics.monthlyActiveUsers.count} (
            {analytics.monthlyActiveUsers.growth >= 0 ? "+" : ""}
            {analytics.monthlyActiveUsers.growth}% MoM)
          </span>
        </div>
        <div className="grid grid-cols-2 items-center gap-x-4 pt-4">
          <span className="text-left font-bold text-element-900">
            Last 7 days Average Daily Active Users:
          </span>
          <span className="font-semibold text-element-700">
            {analytics.averageWeeklyDailyActiveUsers.count} (
            {analytics.averageWeeklyDailyActiveUsers.growth >= 0 ? "+" : ""}
            {analytics.averageWeeklyDailyActiveUsers.growth}% WoW)
          </span>
        </div>
      </div>
    </Modal>
  );
}
