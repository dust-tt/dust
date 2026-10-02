import { canRefreshMCPAuthWithoutDialog } from "@app/components/actions/mcp/forms/utils";
import { describe, expect, it } from "vitest";

describe("canRefreshMCPAuthWithoutDialog", () => {
  it("returns true for mcp provider with a known use case and no credential fields", () => {
    expect(
      canRefreshMCPAuthWithoutDialog({
        authorization: {
          provider: "mcp",
          supported_use_cases: ["platform_actions", "personal_actions"],
        },
        useCase: "platform_actions",
      })
    ).toBe(true);
  });

  it("returns false when use case or authorization is missing", () => {
    expect(
      canRefreshMCPAuthWithoutDialog({
        authorization: {
          provider: "mcp",
          supported_use_cases: ["platform_actions"],
        },
        useCase: null,
      })
    ).toBe(false);

    expect(
      canRefreshMCPAuthWithoutDialog({
        authorization: null,
        useCase: "platform_actions",
      })
    ).toBe(false);
  });

  it("returns true for mcp_static — Refresh reuses stored client credentials", () => {
    expect(
      canRefreshMCPAuthWithoutDialog({
        authorization: {
          provider: "mcp_static",
          supported_use_cases: ["platform_actions"],
        },
        useCase: "platform_actions",
      })
    ).toBe(true);
  });

  it("returns false for snowflake shared static credential form", () => {
    expect(
      canRefreshMCPAuthWithoutDialog({
        authorization: {
          provider: "snowflake",
          supported_use_cases: ["platform_actions"],
        },
        useCase: "platform_actions",
      })
    ).toBe(false);
  });
});
