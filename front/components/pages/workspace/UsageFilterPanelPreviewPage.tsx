import {
  useSetContentWidth,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { UsageFilterPanel } from "@app/components/workspace/analytics/UsageFilterPanel";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import {
  USAGE_FILTER_MOCK_ENTITIES,
  USAGE_FILTER_MOCK_GROUPS,
} from "@app/components/workspace/analytics/usageFilterMockData";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { Page } from "@dust-tt/sparkle";
import { useState } from "react";

// Temporary preview page for the UsageFilterPanel component. Agents/models/
// tools/skills/sources are still mock data; members are fetched live (the
// panel is rendered inside the real authenticated workspace shell).
export function UsageFilterPanelPreviewPage() {
  const owner = useWorkspace();
  const [filter, setFilter] = useState<UsageFilter>({});

  useSetContentWidth("centered");
  useSetPageTitle("Dust - Usage filter panel preview");

  return (
    <>
      <Page.Header title="Usage filter panel preview" />
      <Page.Layout direction="vertical">
        <div className="flex flex-col gap-4">
          <UsageFilterPanel
            owner={owner}
            categoryEntities={USAGE_FILTER_MOCK_ENTITIES}
            groups={USAGE_FILTER_MOCK_GROUPS}
            filter={filter}
            onFilterChange={setFilter}
          />
          <pre className="rounded-lg bg-muted p-4 text-xs">
            {JSON.stringify(filter, null, 2)}
          </pre>
        </div>
      </Page.Layout>
    </>
  );
}
