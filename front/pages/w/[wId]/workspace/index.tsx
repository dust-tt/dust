import { Button, Input, Page, PlanetIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import {
  ActivityReport,
  QuickInsights,
} from "@app/components/workspace/Analytics";
import { ProviderManagementModal } from "@app/components/workspace/ProviderManagementModal";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  gaTrackingId: string;
}>(async (context, auth) => {
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
  const [showProviderModal, setShowProviderModal] = useState(false);

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
      <ProviderManagementModal
        owner={owner}
        showProviderModal={showProviderModal}
        onClose={() => setShowProviderModal(false)}
      />
      <AppLayout
        subscription={subscription}
        owner={owner}
        gaTrackingId={gaTrackingId}
        subNavigation={subNavigationAdmin({ owner, current: "workspace" })}
      >
        <Page.Vertical align="stretch" gap="xl">
          <Page.Header
            title="Workspace"
            icon={PlanetIcon}
            description="Manage your workspace"
          />
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h4">Analytics</Page.H>
            <Page.Horizontal gap="lg">
              <QuickInsights owner={owner} />
              <ActivityReport
                monthOptions={monthOptions}
                selectedMonth={selectedMonth}
                handleSelectedMonth={handleSelectMonth}
                isLoading={isLoading}
                handleDownload={handleDownload}
              />
            </Page.Horizontal>
          </Page.Vertical>
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h4">Settings</Page.H>
            <div className="grid grid-cols-2 gap-2">
              <Page.H variant="h6">Workspace name</Page.H>
              <Page.H variant="h6">Model Selection</Page.H>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Page.P variant="secondary">
                Think GitHub repository names, short and memorable.
              </Page.P>
              <Page.P variant="secondary">
                Select the models you want available to your workspace for the
                creation of AI Assistants.
              </Page.P>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-row gap-2">
                <Input
                  name="name"
                  placeholder="Workspace name"
                  value={workspaceName}
                  onChange={(x) => setWorkspaceName(x)}
                  error={workspaceNameError}
                  showErrorLabel={true}
                />
                {!disable && (
                  <Button
                    variant="primary"
                    disabled={disable || updating}
                    onClick={handleUpdateWorkspace}
                    label={updating ? "Saving..." : "Save"}
                    className="grow-0"
                  />
                )}
              </div>
              <div>
                <Button
                  variant="primary"
                  onClick={() => setShowProviderModal(true)}
                  label="Manage providers"
                  className="grow-0"
                />
              </div>
            </div>
          </Page.Vertical>
        </Page.Vertical>
      </AppLayout>
    </>
  );
}
