import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";

export const MCP_TOOL_STAKE_LABELS: Record<MCPToolStakeLevelType, string> = {
  high: "High (always ask for confirmation)",
  medium: "Medium (allows input-scoped confirmation save)",
  low: "Low (allows user-global confirmation save)",
  never_ask: "Never ask (automatic execution)",
};

export const MCP_TOOL_STAKE_SHORT_LABELS: Record<
  MCPToolStakeLevelType,
  string
> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  never_ask: "Never ask",
};

export const MCP_TOOL_STAKE_DESCRIPTIONS: Record<
  MCPToolStakeLevelType,
  string
> = {
  high: "Needs explicit user approval.",
  medium: "Users can save confirmations for specific tool inputs.",
  low: "Users can completely disable confirmations.",
  never_ask: "Runs automatically.",
};

export const MCP_TOOL_STAKE_COLORS = {
  high: "warning",
  medium: "info",
  low: "highlight",
  never_ask: "success",
} as const satisfies Record<MCPToolStakeLevelType, string>;
