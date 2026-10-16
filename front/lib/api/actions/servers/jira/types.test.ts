import { isADFDocument } from "@app/lib/api/actions/servers/jira/types";
import { describe, expect, it } from "vitest";

function nestInNodes(
  types: string[],
  depth: number,
  leaf: Record<string, unknown>
): Record<string, unknown> {
  let node = leaf;
  for (let i = 0; i < depth; i++) {
    node = { type: types[i % types.length], content: [node] };
  }
  return node;
}

const PARAGRAPH = {
  type: "paragraph",
  content: [{ type: "text", text: "hello" }],
};

describe("isADFDocument", () => {
  it("validates deeply nested node types in linear time", () => {
    // With a union whose branches each recurse into `content`, this took several seconds: each
    // nesting level re-validated its subtree once per branch it fell through.
    const doc = {
      type: "doc",
      version: 1,
      content: [nestInNodes(["taskList", "taskItem"], 10, PARAGRAPH)],
    };

    const start = performance.now();
    const isValid = isADFDocument(doc);
    const elapsedMs = performance.now() - start;

    expect(isValid).toBe(true);
    expect(elapsedMs).toBeLessThan(500);
  });

  it("rejects a document with a deeply nested node missing its type", () => {
    const doc = {
      type: "doc",
      version: 1,
      content: [
        nestInNodes(["table", "tableRow", "tableCell"], 6, { text: "hello" }),
      ],
    };

    expect(isADFDocument(doc)).toBe(false);
  });
});
