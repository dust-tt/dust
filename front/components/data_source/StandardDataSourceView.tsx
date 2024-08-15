import { Page, Tab } from "@dust-tt/sparkle";
import type { DataSourceType, PlanType, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import { DatasourceDocumentsTabView } from "@app/components/data_source/DatasourceDocumentsTabView";
import { DatasourceTablesTabView } from "@app/components/data_source/DatasourceTablesTabView";

const tabIds = ["documents", "tables"];

export function StandardDataSourceView({
  owner,
  plan,
  readOnly,
  dataSource,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  readOnly: boolean;
  dataSource: DataSourceType;
}) {
  const router = useRouter();

  type TabId = (typeof tabIds)[number];
  const [currentTab, setCurrentTab] = useState<TabId>("documents");
  const tabs = useMemo(
    () =>
      tabIds.map((tabId) => ({
        label: tabId.charAt(0).toUpperCase() + tabId.slice(1),
        id: tabId,
        current: currentTab === tabId,
      })),
    [currentTab]
  );

  useEffect(() => {
    if (router.query.tab === "tables") {
      setCurrentTab("tables");
      const newQuery = { ...router.query };
      delete newQuery.tab;
      void router.replace(
        {
          pathname: router.pathname,
          query: newQuery,
        },
        undefined,
        { shallow: true } // no reload
      );
    }
  }, [router]);

  return (
    <div className="pt-6">
      <Page.Vertical gap="xl" align="stretch">
        <Tab tabs={tabs} setCurrentTab={setCurrentTab} />

        {currentTab === "documents" && (
          <DatasourceDocumentsTabView
            owner={owner}
            plan={plan}
            readOnly={readOnly}
            dataSource={dataSource}
          />
        )}
        {currentTab === "tables" && (
          <DatasourceTablesTabView
            owner={owner}
            readOnly={readOnly}
            dataSource={dataSource}
          />
        )}
      </Page.Vertical>
    </div>
  );
}
