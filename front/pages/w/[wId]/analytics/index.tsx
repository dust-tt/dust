import { BarChartIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ActivityReport } from "@app/components/workspace/ActivityReport";
import { QuickInsights } from "@app/components/workspace/Analytics";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  useFeatureFlags,
  useWorkspaceSubscriptions,
} from "@app/lib/swr/workspaces";
import type { SubscriptionType, WorkspaceType } from "@app/types";

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

export default function Analytics({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(true);

  const { subscriptions } = useWorkspaceSubscriptions({
    owner,
  });

  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

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
      const response = await fetch(
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
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
    <>
      <AppCenteredLayout
        subscription={subscription}
        owner={owner}
        subNavigation={subNavigationAdmin({
          owner,
          current: "analytics",
          featureFlags,
        })}
      >
        <Page.Vertical align="stretch" gap="xl">
          <Page.Header
            title="Analytics"
            icon={BarChartIcon}
            description="Monitor workspace activity and usage"
          />
          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <QuickInsights owner={owner} />
            <ActivityReport
              downloadingMonth={downloadingMonth}
              monthOptions={monthOptions}
              handleDownload={handleDownload}
              includeInactive={includeInactive}
              onIncludeInactiveChange={setIncludeInactive}
            />
          </div>
        </Page.Vertical>
      </AppCenteredLayout>
    </>
  );
}

Analytics.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
