import {
  createOAuthCheckSkippedNoUseCase,
  deriveDiagnosticSummary,
  resolveConnectionTypesToTest,
} from "@app/lib/api/poke/mcp_diagnostics";
import { parseMCPDiagnosticReport } from "@app/lib/api/poke/mcp_diagnostics_types";
import { describe, expect, it } from "vitest";

describe("resolveConnectionTypesToTest", () => {
  it("defaults platform_actions to workspace only", () => {
    expect(
      resolveConnectionTypesToTest({ oAuthUseCase: "platform_actions" })
    ).toEqual(["workspace"]);
  });

  it("tests workspace and personal for personal_actions when user_id is set", () => {
    expect(
      resolveConnectionTypesToTest({
        oAuthUseCase: "personal_actions",
        userId: "user_123",
      })
    ).toEqual(["workspace", "personal"]);
  });

  it("respects explicit connection_type override", () => {
    expect(
      resolveConnectionTypesToTest({
        oAuthUseCase: "platform_actions",
        connectionType: "both",
      })
    ).toEqual(["workspace", "personal"]);
  });
});

describe("createOAuthCheckSkippedNoUseCase", () => {
  it("marks oauth checks as skipped when oAuthUseCase is not configured", () => {
    expect(createOAuthCheckSkippedNoUseCase("oauth_metadata")).toMatchObject({
      check: "oauth_metadata",
      status: "skipped",
      oAuthUseCase: null,
      details: { reason: "no_oauth_use_case" },
    });
    expect(
      createOAuthCheckSkippedNoUseCase("oauth_metadata").message
    ).toContain("no oAuthUseCase configured");
  });
});

describe("deriveDiagnosticSummary", () => {
  it("returns ok when all checks pass", () => {
    expect(
      deriveDiagnosticSummary(
        [
          { check: "connection_inventory", status: "ok" },
          { check: "oauth_token_fetch", status: "ok" },
        ],
        "platform_actions"
      )
    ).toEqual({
      overall: "ok",
      primary_issue: null,
      recommended_action: null,
    });
  });

  it("detects personal vs workspace mismatch", () => {
    expect(
      deriveDiagnosticSummary(
        [
          {
            check: "connection_inventory",
            status: "warn",
          },
          {
            check: "sync_simulation",
            status: "error",
            details: { mismatch: true },
          },
        ],
        "personal_actions"
      )
    ).toMatchObject({
      overall: "failed",
      primary_issue: "personal_vs_workspace_mismatch",
    });
  });

  it("returns ok when oauth checks are skipped due to missing oAuthUseCase", () => {
    expect(
      deriveDiagnosticSummary(
        [
          { check: "connection_inventory", status: "ok" },
          {
            check: "oauth_metadata",
            status: "skipped",
            details: { reason: "no_oauth_use_case" },
          },
          {
            check: "oauth_token_fetch",
            status: "skipped",
            details: { reason: "no_oauth_use_case" },
          },
        ],
        null
      )
    ).toEqual({
      overall: "ok",
      primary_issue: null,
      recommended_action: null,
    });
  });

  it("detects oauth token refresh failure", () => {
    expect(
      deriveDiagnosticSummary(
        [
          {
            check: "oauth_token_fetch",
            status: "error",
            error: { code: "token_revoked" },
          },
        ],
        "platform_actions"
      )
    ).toMatchObject({
      overall: "failed",
      primary_issue: "oauth_token_refresh_failure",
    });
  });
});

describe("parseMCPDiagnosticReport", () => {
  it("parses a valid diagnostic report", () => {
    const report = parseMCPDiagnosticReport(
      JSON.stringify({
        workspace_id: "w1",
        mcp_server_id: "rms_1",
        server_view: null,
        checks_requested: ["connection_inventory"],
        connection_types_tested: ["workspace"],
        summary: {
          overall: "ok",
          primary_issue: null,
          recommended_action: null,
        },
        checks: [
          {
            check: "connection_inventory",
            status: "ok",
          },
        ],
        poke_url: "https://poke.dust.tt/w1",
      })
    );

    expect(report?.mcp_server_id).toBe("rms_1");
    expect(report?.checks).toHaveLength(1);
  });

  it("returns null for invalid json", () => {
    expect(parseMCPDiagnosticReport("not json")).toBeNull();
  });
});
