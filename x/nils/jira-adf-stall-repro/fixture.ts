// Synthetic Jira search response. Single-node-per-level nesting makes the cost
// grow exactly 3x per level (3 union branches in ADFContentNodeSchema recurse
// into `content`); `issues` is a linear multiplier. 11 levels x 4 issues ~= 71s,
// which clears the 60s TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS with margin.
export const LEVELS = 11;
export const ISSUES = 4;

function nestSingle(levels: number): unknown {
  let node: unknown = { type: "paragraph", content: [{ type: "text", text: "x" }] };
  for (let i = 0; i < levels; i++) {
    node = { type: "taskItem", content: [node] };
  }
  return node;
}

export function buildSearchResponse() {
  return {
    issues: Array.from({ length: ISSUES }, (_, i) => ({
      id: String(10000 + i),
      key: `STALL-${i + 1}`,
      fields: {
        summary: "Synthetic nested ADF",
        description: { type: "doc", version: 1, content: [nestSingle(LEVELS)] },
      },
    })),
    isLast: true,
  };
}
