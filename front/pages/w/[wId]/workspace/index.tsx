import {
  Button,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  DropdownMenu,
  Input,
  Page,
  PageHeader,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React, { useCallback, useEffect, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function WorkspaceAdmin({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState<string>("");

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

    try {
      const response = await fetch(
        `/api/w/${owner.sId}/monthly-usage?referenceDate=${selectedMonth}-01`
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

      let filename = `dust_${owner.name}_monthly_activity_${year}_${monthName}`;

      // If the selected month is the current month, append the day
      if (monthName === currentMonthName) {
        filename += `_until_${formattedDay}`;
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
    }
  };

  const monthOptions: string[] = [];

  if (owner.upgradedAt) {
    const upgradedAtDate = new Date(owner.upgradedAt);
    const upgradedYear = upgradedAtDate.getFullYear();
    const upgradedMonth = upgradedAtDate.getMonth();

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    for (let year = upgradedYear; year <= currentYear; year++) {
      const startMonth = year === upgradedYear ? upgradedMonth : 0;
      const endMonth = year === currentYear ? currentMonth : 11;
      for (let month = startMonth; month <= endMonth; month++) {
        monthOptions.push(`${year}-${String(month + 1).padStart(2, "0")}`);
      }
    }

    if (!selectedMonth) {
      setSelectedMonth(monthOptions[monthOptions.length - 1]);
    }
  }

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "workspace" })}
    >
      <Page.Vertical>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <PageHeader
            title="Workspace Settings"
            icon={Cog6ToothIcon}
            description="Use this page to manage your workspace."
          />
          <div />
          <Page.SectionHeader
            title="Workspace name"
            description="Think GitHub repository names, short and memorable."
          />
          <div className="flex w-full flex-col gap-4">
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
            <div>
              <Button
                variant="secondary"
                disabled={disable || updating}
                onClick={handleUpdateWorkspace}
                label={updating ? "Updating..." : "Update"}
              />
            </div>
          </div>

          <div />
          {!!monthOptions.length && (
            <>
              <Page.SectionHeader
                title="Workspace Activity"
                description="Download monthly workspace activity details."
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
                  label="Download activity data"
                  icon={CloudArrowDownIcon}
                  variant="secondary"
                  onClick={() => {
                    void handleDownload(selectedMonth);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </Page.Vertical>
    </AppLayout>
  );
}
