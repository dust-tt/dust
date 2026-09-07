import {
  getUsageType,
  resolveUsageTypeForAttribution,
} from "@app/lib/api/programmatic_usage/common";
import { describe, expect, it } from "vitest";

describe("getUsageType", () => {
  it("classifies free origins as free regardless of the programmatic flag", () => {
    expect(getUsageType(false, "agent_sidekick")).toBe("free");
    expect(getUsageType(true, "agent_sidekick")).toBe("free");
  });

  it("classifies programmatic usage as programmatic", () => {
    expect(getUsageType(true, "web")).toBe("programmatic");
  });

  it("classifies non-programmatic, non-free usage as user", () => {
    expect(getUsageType(false, "web")).toBe("user");
  });
});

describe("resolveUsageTypeForAttribution", () => {
  it("resolves unattributed Slack usage to programmatic", () => {
    // e.g. a Slack message whose sender's email didn't match a Dust
    // workspace member: attributeUserFromWorkspaceAndEmail found no user.
    expect(
      resolveUsageTypeForAttribution("user", {
        userId: null,
        origin: "slack",
        authMethod: "system_api_key",
      })
    ).toBe("programmatic");
  });

  it("resolves attributed Slack usage to the matched user", () => {
    expect(
      resolveUsageTypeForAttribution("user", {
        userId: "user",
        origin: "slack",
        authMethod: "system_api_key",
      })
    ).toBe("user");
  });

  it("leaves unattributed Slack usage untouched when not authenticated via the system key", () => {
    // A real session/oauth (or any non-system-key) auth on a Slack origin is
    // unexpected — treat a missing userId there as a genuine attribution bug.
    expect(
      resolveUsageTypeForAttribution("user", {
        userId: null,
        origin: "slack",
        authMethod: "session",
      })
    ).toBe("user");
  });

  it("leaves other unattributed user origins untouched (genuine attribution bug)", () => {
    // web/extension/cli/... always carry a real Dust user — a missing
    // userId there is a bug that buildUsageEvents must still catch.
    expect(
      resolveUsageTypeForAttribution("user", {
        userId: null,
        origin: "web",
        authMethod: "system_api_key",
      })
    ).toBe("user");
  });

  it("leaves non-user usage types untouched", () => {
    expect(
      resolveUsageTypeForAttribution("programmatic", {
        userId: null,
        origin: "slack",
        authMethod: "system_api_key",
      })
    ).toBe("programmatic");
    expect(
      resolveUsageTypeForAttribution("free", {
        userId: null,
        origin: "slack",
        authMethod: "system_api_key",
      })
    ).toBe("free");
  });
});
