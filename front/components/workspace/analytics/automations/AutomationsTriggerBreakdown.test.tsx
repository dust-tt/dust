import { useAutomationsTriggerBreakdown } from "@app/hooks/useAutomationsTriggerBreakdown";
import type { AutomationTriggerCreditDestination } from "@app/lib/api/analytics/automations/breakdown";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationsTriggerBreakdown } from "./AutomationsTriggerBreakdown";

vi.mock(import("@app/hooks/useAutomationsTriggerBreakdown"), () => ({
  useAutomationsTriggerBreakdown: vi.fn(),
}));

const PERIOD = { kind: "days", days: 30 } as const;

const TRIGGER: AutomationTriggerRow = {
  triggerId: "trg1",
  name: "Competitor watch",
  kind: "schedule",
  agent: {
    agentId: "agent1",
    name: "deep-dive",
    pictureUrl: null,
    description: null,
    modelId: null,
    modelDisplayName: null,
  },
  owner: { name: "Nic Siegle", email: null, pictureUrl: null },
  scheduleDescription: "Every day at 9:00",
  webhookSourceName: null,
  webhookSourceRestricted: false,
  webhookIcon: null,
  runCount: 0,
  credits: 0,
  status: "enabled",
  executionMode: "user_pool",
};

describe("AutomationsTriggerBreakdown", () => {
  beforeEach(() => {
    vi.mocked(useAutomationsTriggerBreakdown).mockReturnValue({
      creditDestination: null,
      isBreakdownLoading: false,
      isBreakdownError: false,
      isBreakdownValidating: false,
    });
  });

  it("shows no comparison for a trigger with zero run count, instead of an Infinity ratio", () => {
    render(
      <AutomationsTriggerBreakdown
        scope="workspace"
        workspaceId="w1"
        trigger={TRIGGER}
        period={PERIOD}
        medianRunCount={366}
        medianCostPerRun={3.4}
      />
    );

    expect(screen.getAllByText("no comparison available")).toHaveLength(2);
    expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
  });

  it("compares a trigger's stats against a non-zero median", () => {
    render(
      <AutomationsTriggerBreakdown
        scope="workspace"
        workspaceId="w1"
        trigger={{ ...TRIGGER, runCount: 720, credits: 2448 }}
        period={PERIOD}
        medianRunCount={360}
        medianCostPerRun={1}
      />
    );

    expect(screen.getByText("2x more than most")).toBeInTheDocument();
  });

  it.each<[AutomationTriggerCreditDestination["dimension"], string]>([
    ["tool", "What tool is used"],
    ["model", "What model is used"],
    ["skill", "What skill is used"],
  ])("labels a %s credit destination accurately", (dimension, label) => {
    vi.mocked(useAutomationsTriggerBreakdown).mockReturnValue({
      creditDestination: {
        dimension,
        key: `${dimension}-id`,
        name: `${dimension} name`,
        icon: null,
        credits: 42,
        share: 0.75,
      },
      isBreakdownLoading: false,
      isBreakdownError: false,
      isBreakdownValidating: false,
    });

    render(
      <AutomationsTriggerBreakdown
        scope="workspace"
        workspaceId="w1"
        trigger={TRIGGER}
        period={PERIOD}
        medianRunCount={366}
        medianCostPerRun={3.4}
      />
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
