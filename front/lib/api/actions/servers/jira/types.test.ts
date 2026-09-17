import {
  ADFDocumentSchema,
  JiraSearchResultSchema,
} from "@app/lib/api/actions/servers/jira/types";
import { describe, expect, it } from "vitest";

function doc(...content: unknown[]) {
  return { type: "doc", version: 1, content };
}

// Nests `type` nodes `levels` deep around a plain paragraph.
function nest(
  levels: number,
  type: string,
  leaf: unknown = {
    type: "paragraph",
    content: [{ type: "text", text: "x" }],
  }
) {
  let node = leaf;
  for (let i = 0; i < levels; i++) {
    node = { type, content: [node] };
  }
  return node;
}

describe("ADFDocumentSchema", () => {
  it("accepts the node types we render", () => {
    const cases: unknown[] = [
      { type: "paragraph", content: [{ type: "text", text: "hi" }] },
      {
        type: "paragraph",
        content: [{ type: "text", text: "a", marks: [{ type: "strong" }] }],
      },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      },
      { type: "codeBlock", content: [{ type: "text", text: "code" }] },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [{ type: "tableCell", content: [{ type: "paragraph" }] }],
          },
        ],
      },
      { type: "mediaSingle", content: [{ type: "media", attrs: { id: "1" } }] },
      { type: "emoji", attrs: { shortName: ":x:" } },
      { type: "mention", attrs: { id: "1" } },
      { type: "date", attrs: { timestamp: "1" } },
      { type: "status", attrs: { text: "ok" } },
      { type: "inlineCard", attrs: { url: "u" } },
      { type: "blockCard", attrs: { url: "u" } },
      { type: "rule" },
      { type: "paragraph", content: [{ type: "hardBreak" }] },
    ];

    for (const node of cases) {
      expect(ADFDocumentSchema.safeParse(doc(node)).success).toBe(true);
    }
  });

  it("accepts a document with no content, and an empty one", () => {
    expect(
      ADFDocumentSchema.safeParse({ type: "doc", version: 1 }).success
    ).toBe(true);
    expect(ADFDocumentSchema.safeParse(doc()).success).toBe(true);
  });

  it("rejects a document that is not an ADF doc", () => {
    expect(
      ADFDocumentSchema.safeParse({ type: "doc", version: 2, content: [] })
        .success
    ).toBe(false);
    expect(
      ADFDocumentSchema.safeParse({ type: "notdoc", version: 1, content: [] })
        .success
    ).toBe(false);
    // A node has to at least be shaped like one.
    expect(ADFDocumentSchema.safeParse(doc({ type: 123 })).success).toBe(false);
  });

  // @cc adf-unknown-subtree-passthrough
  it("accepts unknown node types and passes their subtree through", () => {
    const parsed = ADFDocumentSchema.safeParse(
      doc({
        type: "taskList",
        attrs: { localId: "1" },
        extraField: "kept",
        content: [{ type: "taskItem", content: [{ type: "text", text: "t" }] }],
      })
    );

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.content?.[0]).toMatchObject({
      type: "taskList",
      extraField: "kept",
    });
  });

  // @cc adf-unknown-subtree-passthrough
  it("does not fail a document because one nested node is malformed", () => {
    expect(
      ADFDocumentSchema.safeParse(
        doc({
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: 123 }] }],
        })
      ).success
    ).toBe(true);
  });
});

// @cc adf-validation-cost-linear
// Before type-based dispatch these took exponential time in the nesting depth:
// 11 levels of an unknown node type already blocked the event loop for ~18s, and
// malformed deep input exhausted the heap. Any regression here does not slow
// these down, it hangs them, so the thresholds are deliberately loose.
describe("ADFDocumentSchema validation cost", () => {
  const DEEP = 40;
  const BUDGET_MS = 2000;

  function expectFastParse(value: unknown) {
    const start = Date.now();
    ADFDocumentSchema.safeParse(value);
    expect(Date.now() - start).toBeLessThan(BUDGET_MS);
  }

  it("stays fast on deeply nested known node types", () => {
    expectFastParse(doc(nest(DEEP, "listItem")));
  });

  it("stays fast on deeply nested unknown node types", () => {
    expectFastParse(doc(nest(DEEP, "taskItem")));
  });

  it("stays fast on deeply nested malformed input", () => {
    expectFastParse(doc(nest(DEEP, "listItem", { type: 123 })));
    expectFastParse(doc(nest(DEEP, "taskItem", { type: 123 })));
  });

  it("stays fast for a full search response, as returned by the Jira API", () => {
    const issues = Array.from({ length: 20 }, (_, i) => ({
      id: String(10000 + i),
      key: `TEST-${i}`,
      fields: {
        summary: "Deeply nested description",
        description: doc(nest(DEEP, "taskItem")),
      },
    }));

    const start = Date.now();
    const parsed = JiraSearchResultSchema.safeParse({ issues, isLast: true });
    expect(parsed.success).toBe(true);
    expect(Date.now() - start).toBeLessThan(BUDGET_MS);
  });
});
