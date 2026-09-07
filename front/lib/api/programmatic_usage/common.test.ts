import { isProgrammaticUsageFromContext } from "@app/lib/api/programmatic_usage/common";
import { describe, expect, it } from "vitest";

describe("isProgrammaticUsageFromContext", () => {
  it("classifies api_key auth as programmatic regardless of origin", () => {
    expect(
      isProgrammaticUsageFromContext({
        authMethod: "api_key",
        userMessageOrigin: "web",
      })
    ).toBe(true);
  });

  it("classifies programmatic origins as programmatic regardless of auth method", () => {
    expect(
      isProgrammaticUsageFromContext({
        authMethod: "session",
        userMessageOrigin: "api",
      })
    ).toBe(true);
  });

  it("resolves unattributed Slack usage to programmatic", () => {
    // e.g. a Slack message whose sender's email didn't match a Dust
    // workspace member: attributeUserFromWorkspaceAndEmail found no user.
    expect(
      isProgrammaticUsageFromContext({
        authMethod: "session",
        userMessageOrigin: "slack",
        userId: null,
        messageAuthMethod: "system_api_key",
      })
    ).toBe(true);
  });

  it("resolves attributed Slack usage to user", () => {
    expect(
      isProgrammaticUsageFromContext({
        authMethod: "session",
        userMessageOrigin: "slack",
        userId: "user",
        messageAuthMethod: "system_api_key",
      })
    ).toBe(false);
  });

  it("leaves unattributed Slack usage as user when not authenticated via the system key", () => {
    // A real session/oauth (or any non-system-key) auth on a Slack origin is
    // unexpected — treat a missing userId there as a genuine attribution bug.
    expect(
      isProgrammaticUsageFromContext({
        authMethod: "session",
        userMessageOrigin: "slack",
        userId: null,
        messageAuthMethod: "session",
      })
    ).toBe(false);
  });

  it("leaves other unattributed user origins as user (genuine attribution bug)", () => {
    // web/extension/cli/... always carry a real Dust user — a missing
    // userId there is a bug that buildUsageEvents must still catch.
    expect(
      isProgrammaticUsageFromContext({
        authMethod: "session",
        userMessageOrigin: "web",
        userId: null,
        messageAuthMethod: "system_api_key",
      })
    ).toBe(false);
  });

  it("skips the fallback when userId is not provided", () => {
    // Callers that don't have the resolved userId must not trigger the
    // fallback — it should never downgrade or upgrade classification on
    // unknown information.
    expect(
      isProgrammaticUsageFromContext({
        authMethod: "session",
        userMessageOrigin: "slack",
        messageAuthMethod: "system_api_key",
      })
    ).toBe(false);
  });
});
