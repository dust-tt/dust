import { isValidJSON } from "@app/lib/utils/json";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import { z } from "zod";

export const MCP_DIAGNOSTIC_CHECK_NAMES = [
  "connection_inventory",
  "oauth_metadata",
  "oauth_token_fetch",
  "connect_list_tools",
  "sync_simulation",
] as const;

export type MCPDiagnosticCheckName =
  (typeof MCP_DIAGNOSTIC_CHECK_NAMES)[number];

export type MCPDiagnosticCheckStatus = "ok" | "warn" | "error" | "skipped";

export type MCPDiagnosticSummary = {
  overall: "ok" | "warn" | "failed";
  primary_issue: string | null;
  recommended_action: string | null;
};

export type MCPDiagnosticCheckResult = {
  check: MCPDiagnosticCheckName;
  status: MCPDiagnosticCheckStatus;
  duration_ms?: number;
  connection_type?: "workspace" | "personal";
  oAuthUseCase?: MCPOAuthUseCase | null;
  message?: string;
  error?: Record<string, unknown>;
  details?: Record<string, unknown>;
};

export type MCPDiagnosticServerView = {
  sId: string;
  oAuthUseCase: MCPOAuthUseCase | null;
  serverType: "internal" | "remote";
  url: string | null;
  name: string | null;
};

export type MCPDiagnosticReport = {
  workspace_id: string;
  mcp_server_id: string;
  server_view: MCPDiagnosticServerView | null;
  checks_requested: MCPDiagnosticCheckName[];
  connection_types_tested: ("workspace" | "personal")[];
  summary: MCPDiagnosticSummary;
  checks: MCPDiagnosticCheckResult[];
  poke_url: string;
};

const diagnosticCheckResultSchema = z.object({
  check: z.enum(MCP_DIAGNOSTIC_CHECK_NAMES),
  status: z.enum(["ok", "warn", "error", "skipped"]),
  duration_ms: z.number().optional(),
  connection_type: z.enum(["workspace", "personal"]).optional(),
  oAuthUseCase: z
    .enum(["platform_actions", "personal_actions"])
    .nullable()
    .optional(),
  message: z.string().optional(),
  error: z.record(z.unknown()).optional(),
  details: z.record(z.unknown()).optional(),
});

const diagnosticReportSchema = z.object({
  workspace_id: z.string(),
  mcp_server_id: z.string(),
  server_view: z
    .object({
      sId: z.string(),
      oAuthUseCase: z.enum(["platform_actions", "personal_actions"]).nullable(),
      serverType: z.enum(["internal", "remote"]),
      url: z.string().nullable(),
      name: z.string().nullable(),
    })
    .nullable(),
  checks_requested: z.array(z.enum(MCP_DIAGNOSTIC_CHECK_NAMES)),
  connection_types_tested: z.array(z.enum(["workspace", "personal"])),
  summary: z.object({
    overall: z.enum(["ok", "warn", "failed"]),
    primary_issue: z.string().nullable(),
    recommended_action: z.string().nullable(),
  }),
  checks: z.array(diagnosticCheckResultSchema),
  poke_url: z.string(),
});

export function parseMCPDiagnosticReport(
  text: string | null | undefined
): MCPDiagnosticReport | null {
  if (!text || !isValidJSON(text)) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    const result = diagnosticReportSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function formatDiagnosticCheckName(check: string): string {
  return check.replaceAll("_", " ");
}
