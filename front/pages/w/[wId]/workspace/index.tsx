import { Button, CompanyIcon, Input, Page } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { ActivityReport } from "@app/components/workspace/ActivityReport";
import { QuickInsights } from "@app/components/workspace/Analytics";
import { ProviderManagementModal } from "@app/components/workspace/ProviderManagementModal";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useWorkspaceSubscriptions } from "@app/lib/swr/workspaces";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
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
    },
  };
});

export default function WorkspaceAdmin({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState<string>("");

  const [isDownloadingData, setIsDownloadingData] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);

  const { subscriptions } = useWorkspaceSubscriptions({
    workspaceId: owner.sId,
  });

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

  const handleDownload = async (selectedMonth: string | null) => {
    if (!selectedMonth) {
      return;
    }

    const queryString = `mode=month&start=${selectedMonth}&table=all`;

    setIsDownloadingData(true);
    try {
      const response = await fetch(
        `/api/w/${owner.sId}/workspace-usage?${queryString}`
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
      alert("Failed to download activity data.");
    } finally {
      setIsDownloadingData(false);
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

      for (let year = startDateYear; year <= currentYear; year++) {
        const startMonth = year === startDateYear ? startDateMonth : 0;
        const endMonth = year === currentYear ? currentMonth : 11;
        for (let month = endMonth; month >= startMonth; month--) {
          monthOptions.push(`${year}-${String(month + 1).padStart(2, "0")}`);
        }
      }
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
        subNavigation={subNavigationAdmin({ owner, current: "workspace" })}
      >
        <Page.Vertical align="stretch" gap="xl">
          <Page.Header
            title="Workspace"
            icon={CompanyIcon}
            description="Manage your workspace"
          />
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h4">Analytics</Page.H>
            <Page.Horizontal gap="lg">
              <QuickInsights owner={owner} />
              <ActivityReport
                isDownloading={isDownloadingData}
                monthOptions={monthOptions}
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
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  error={workspaceNameError}
                  showErrorLabel
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
