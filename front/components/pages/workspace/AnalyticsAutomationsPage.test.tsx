import { AnalyticsAutomationsPage } from "@app/components/pages/workspace/AnalyticsAutomationsPage";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({ hasFeature: () => true }),
  useWorkspace: () => ({ sId: "workspace-id" }),
}));

vi.mock(
  "@app/components/workspace/analytics/automations/AutomationsOverview",
  () => ({ AutomationsOverview: () => <div>Automations overview</div> })
);

vi.mock(
  "@app/components/workspace/analytics/automations/AutomationsTriggersTable",
  () => ({ AutomationsTriggersTable: () => <div>Triggers table</div> })
);

vi.mock(
  "@app/components/workspace/analytics/automations/AutomationsApiKeysTable",
  () => ({ AutomationsApiKeysTable: () => <div>API keys table</div> })
);

vi.mock(
  "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector",
  () => ({ ConsumptionPeriodSelector: () => <div>Period selector</div> })
);

describe("AnalyticsAutomationsPage", () => {
  it("switches from triggers to API keys", () => {
    render(<AnalyticsAutomationsPage />);

    expect(screen.getByText("Triggers table")).toBeInTheDocument();
    expect(screen.queryByText("API keys table")).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "API keys" }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByText("API keys table")).toBeInTheDocument();
    expect(screen.queryByText("Triggers table")).not.toBeInTheDocument();
  });
});
