import type { IntegrationTool } from "../types";

// Token sets used to classify a tool by name. The lists are intentionally
// permissive — tool names across partners are inconsistent (e.g. Attio has
// `search-records` and `create-note`, Jira has `getIssue` and `addComment`),
// so we lowercase the name and check membership.
//
// Order matters only for *picking the most representative* tool inside a
// bucket: a tool that contains the first token in the list ranks above one
// that contains a later token. See `pickToolsForIntent` below.
const READ_TOKENS = [
  "search",
  "list",
  "get",
  "fetch",
  "read",
  "find",
  "show",
  "describe",
  "view",
] as const;

const WRITE_TOKENS = [
  "create",
  "post",
  "send",
  "add",
  "draft",
  "upsert",
  "update",
  "edit",
  "write",
  "delete",
  "remove",
] as const;

const SUMMARY_TOKENS = [
  "summary",
  "summarize",
  "recap",
  "report",
  "analyze",
  "stats",
  "overview",
  "digest",
] as const;

// Discrete shapes describing what the partner's toolset is mostly about.
// Used by the heuristic chat / benefits generators to pick the right
// template phrasing.
export type ToolBias = "read-heavy" | "write-heavy" | "balanced" | "minimal";

export interface ToolShape {
  bias: ToolBias;
  readTools: IntegrationTool[];
  writeTools: IntegrationTool[];
  summaryTools: IntegrationTool[];
  // Tools that didn't match any token. Often domain-specific verbs
  // (e.g. `enrich-record`). Kept available for the engines to fall back on
  // when read/write buckets are thin.
  otherTools: IntegrationTool[];
  total: number;
}

function nameContainsAny(name: string, tokens: ReadonlyArray<string>): boolean {
  const lower = name.toLowerCase();
  for (const token of tokens) {
    if (lower.includes(token)) {
      return true;
    }
  }
  return false;
}

// Rank within a bucket: the lower the index of the first matching token, the
// higher the priority. This biases `pickToolsForIntent("read")` toward
// `search-*` over `get-*` over `list-*`, etc.
function rankByTokens(
  tool: IntegrationTool,
  tokens: ReadonlyArray<string>
): number {
  const lower = tool.name.toLowerCase();
  for (let i = 0; i < tokens.length; i++) {
    if (lower.includes(tokens[i])) {
      return i;
    }
  }
  // No match: push to the end.
  return tokens.length;
}

// Bucket a partner's tools by intent and infer the dominant shape.
//
// This is the only place that touches tool *names* with hard-coded tokens;
// the chat / benefits generators consume `ToolShape` and stay agnostic of the
// raw strings. If we ever switch to semantic classification (LLM-driven or
// MCP-server-declared categories), only this function needs to change.
export function analyzeToolShape(tools: IntegrationTool[]): ToolShape {
  const readTools: IntegrationTool[] = [];
  const writeTools: IntegrationTool[] = [];
  const summaryTools: IntegrationTool[] = [];
  const otherTools: IntegrationTool[] = [];

  for (const tool of tools) {
    if (nameContainsAny(tool.name, SUMMARY_TOKENS)) {
      summaryTools.push(tool);
      // Also count summary tools as read tools — they almost always read data.
      readTools.push(tool);
      continue;
    }
    if (nameContainsAny(tool.name, WRITE_TOKENS) || tool.isWriteAction) {
      writeTools.push(tool);
      continue;
    }
    if (nameContainsAny(tool.name, READ_TOKENS)) {
      readTools.push(tool);
      continue;
    }
    otherTools.push(tool);
  }

  let bias: ToolBias;
  if (tools.length === 0) {
    bias = "minimal";
  } else if (readTools.length >= writeTools.length * 2) {
    bias = "read-heavy";
  } else if (writeTools.length >= readTools.length * 2) {
    bias = "write-heavy";
  } else {
    bias = "balanced";
  }

  return {
    bias,
    readTools,
    writeTools,
    summaryTools,
    otherTools,
    total: tools.length,
  };
}

export type ToolIntent = "read" | "write" | "summary";

// Pick up to `count` tools that best fit a given intent, ranked by token
// priority (see `rankByTokens`). Returns the tool *names* (matching
// `IntegrationTool.name`) so callers can drop them straight into a storyline.
export function pickToolsForIntent(
  shape: ToolShape,
  intent: ToolIntent,
  count: number
): string[] {
  const source: IntegrationTool[] =
    intent === "read"
      ? shape.readTools
      : intent === "write"
        ? shape.writeTools
        : shape.summaryTools;

  const tokens: ReadonlyArray<string> =
    intent === "read"
      ? READ_TOKENS
      : intent === "write"
        ? WRITE_TOKENS
        : SUMMARY_TOKENS;

  // Sort a copy to respect [GEN5] (no mutation of params).
  const sorted = [...source].sort(
    (a, b) => rankByTokens(a, tokens) - rankByTokens(b, tokens)
  );

  return sorted.slice(0, count).map((t) => t.name);
}

// Pick any `count` tools from the partner, preferring read tools then write
// tools then others. Used by the chat-mockup generator when the partner has
// only a handful of tools and we need to fill the tool-calls chip strip
// without being picky about intent.
export function pickAnyTools(shape: ToolShape, count: number): string[] {
  const ordered = [
    ...shape.readTools,
    ...shape.writeTools,
    ...shape.otherTools,
  ];
  // Deduplicate by name — summary tools are double-counted in readTools.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tool of ordered) {
    if (!seen.has(tool.name)) {
      seen.add(tool.name);
      result.push(tool.name);
      if (result.length === count) {
        break;
      }
    }
  }
  return result;
}
