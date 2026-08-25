import { getConsumptionAnalyticsUrl } from "@app/hooks/useConsumptionQuery";
import { describe, expect, it } from "vitest";

describe("getConsumptionAnalyticsUrl", () => {
  it("builds the workspace consumption URL by default", () => {
    expect(
      getConsumptionAnalyticsUrl({
        workspaceId: "workspace-id",
        endpoint: "overview",
      })
    ).toBe("/api/w/workspace-id/analytics/consumption/overview");
  });

  it("builds the personal consumption URL", () => {
    expect(
      getConsumptionAnalyticsUrl({
        workspaceId: "workspace-id",
        personal: true,
        endpoint: "overview",
      })
    ).toBe("/api/w/workspace-id/me/analytics/consumption/overview");
  });

  it("builds the agent-scoped consumption URL", () => {
    expect(
      getConsumptionAnalyticsUrl({
        workspaceId: "workspace-id",
        agentId: "agent-id",
        endpoint: "overview",
      })
    ).toBe(
      "/api/w/workspace-id/assistant/agent_configurations/agent-id/analytics/consumption/overview"
    );
  });
});
