import { AutomationsTriggersTable } from "@app/components/workspace/analytics/automations/AutomationsTriggersTable";
import type { AutomationsFilter } from "@app/components/workspace/analytics/automationsFilter";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseAutomationsTriggers } = vi.hoisted(() => ({
  mockUseAutomationsTriggers: vi.fn(),
}));

vi.mock("@app/hooks/useAutomationsTriggers", () => ({
  useAutomationsTriggers: mockUseAutomationsTriggers,
}));

vi.mock("@app/hooks/useDownloadCsv", () => ({
  useDownloadCsv: () => ({
    isDownloading: false,
    disabled: false,
    handleDownload: vi.fn(),
  }),
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({ hasFeature: () => false }),
}));

vi.mock("@app/lib/swr/agent_triggers", () => ({
  useUpdateTriggerStatus: () => vi.fn(),
  useUpdateTriggerExecutionMode: () => vi.fn(),
}));

vi.mock("@app/lib/swr/permissions", () => ({
  useWorkspacePermissions: () => ({ hasPermission: () => false }),
}));

vi.mock(
  "@app/components/workspace/analytics/automations/AutomationsFilterPanel",
  () => ({ AutomationsFilterPanel: () => null })
);

vi.mock(
  "@app/components/workspace/analytics/automations/AutomationsFilterSummary",
  () => ({ AutomationsFilterSummary: () => null })
);

vi.mock(
  "@app/components/workspace/analytics/automations/AutomationsTriggerBreakdown",
  () => ({ AutomationsTriggerBreakdown: () => null })
);

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};
const period = { kind: "days", days: 30 } as const;
const filter: AutomationsFilter = {};
const onFilterChange = vi.fn();

function makeTrigger(index: number): AutomationTriggerRow {
  return {
    triggerId: `trigger-${index}`,
    name: `Automation ${index}`,
    kind: "schedule",
    status: "enabled",
    agent: {
      agentId: `agent-${index}`,
      name: `Agent ${index}`,
      pictureUrl: null,
      description: null,
      modelId: null,
      modelDisplayName: null,
    },
    editor: {
      name: `Editor ${index}`,
      email: null,
      pictureUrl: null,
    },
    scheduleDescription: "Every day",
    webhookSourceName: null,
    webhookSourceRestricted: false,
    webhookIcon: null,
    runCount: index,
    credits: index,
    executionMode: "user_pool",
  };
}

const triggers = Array.from({ length: 55 }, (_, index) =>
  makeTrigger(index + 1)
);
const firstPageTriggers = triggers.slice(0, 25);
const secondPageTriggers = triggers.slice(25, 50);
const thirdPageTriggers = triggers.slice(50);
const triggerPages = [firstPageTriggers, secondPageTriggers, thirdPageTriggers];

describe("AutomationsTriggersTable", () => {
  let loadedPageIndex = 0;

  beforeEach(() => {
    loadedPageIndex = 0;
    mockUseAutomationsTriggers.mockImplementation(
      ({ offset }: { offset: number }) => ({
        triggers:
          triggerPages[Math.min(offset / 25, loadedPageIndex)] ??
          firstPageTriggers,
        totalCount: triggers.length,
        medianRunCount: 10,
        medianCostPerRun: 5,
        isTriggersLoading: offset / 25 > loadedPageIndex,
        isTriggersError: undefined,
      })
    );
  });

  it("keeps a destination-sized table and pagination while changing pages", () => {
    const { container, rerender } = render(
      <AutomationsTriggersTable
        owner={owner}
        period={period}
        filter={filter}
        onFilterChange={onFilterChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    const loadingContent =
      container.querySelector<HTMLElement>('[aria-busy="true"]');
    if (!loadingContent) {
      throw new Error("Expected paginated automation rows to be loading");
    }
    const skeletonRows = loadingContent.querySelectorAll(
      'tbody tr[aria-hidden="true"]'
    );
    expect(skeletonRows).toHaveLength(25);
    expect(skeletonRows[0].querySelectorAll("td")).toHaveLength(7);
    expect(
      within(loadingContent).getByRole("button", { name: "2" })
    ).toBeInTheDocument();

    loadedPageIndex = 1;
    rerender(
      <AutomationsTriggersTable
        owner={owner}
        period={period}
        filter={filter}
        onFilterChange={onFilterChange}
      />
    );

    expect(screen.getByText("Automation 50")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    const finalPageLoadingContent =
      container.querySelector<HTMLElement>('[aria-busy="true"]');
    if (!finalPageLoadingContent) {
      throw new Error("Expected final automation rows to be loading");
    }
    expect(
      finalPageLoadingContent.querySelectorAll('tbody tr[aria-hidden="true"]')
    ).toHaveLength(5);
    expect(
      within(finalPageLoadingContent).getByRole("button", { name: "3" })
    ).toBeInTheDocument();

    loadedPageIndex = 2;
    rerender(
      <AutomationsTriggersTable
        owner={owner}
        period={period}
        filter={filter}
        onFilterChange={onFilterChange}
      />
    );

    expect(screen.getByText("Automation 55")).toBeInTheDocument();
  });
});
