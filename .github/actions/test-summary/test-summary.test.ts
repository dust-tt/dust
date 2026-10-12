import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  collectTests,
  diffTests,
  renderSummary,
  truncateSummary,
} from "./test-summary.ts";

describe("collectTests", () => {
  it("prefixes test titles with their enclosing describe titles", () => {
    const tests = collectTests(
      `describe("outer", () => {
        describe("inner", () => {
          it("does a thing", () => {});
        });
        test.skip("is skipped", () => {});
      });`,
      "a.test.ts"
    );

    assert.deepEqual(
      [...tests.keys()],
      ["outer › inner › does a thing", "outer › is skipped"]
    );
  });

  it("ignores whitespace-only differences in test bodies", () => {
    const compact = collectTests(
      `it("x", () => { expect(1).toBe(1); });`,
      "a.test.ts"
    );
    const spread = collectTests(
      `it("x", () => {\n  expect(1).toBe(1);\n});`,
      "a.test.ts"
    );

    const compactBody = compact.get("x")?.body;
    assert.ok(compactBody);
    assert.equal(spread.get("x")?.body, compactBody);
  });

  it("parses generic arrows in .ts files", () => {
    const tests = collectTests(
      `const id = <T,>(value: T) => value;\nconst cast = <string>id("a");\nit("x", () => {});\nit("y", () => {});`,
      "a.test.ts"
    );

    assert.deepEqual([...tests.keys()], ["x", "y"]);
  });

  it("counts it.each case tables as part of the test body", () => {
    const before = collectTests(
      `it.each([1, 2])("x %s", (n) => {});\nit.each\`a\${1}\`("y", () => {});`,
      "a.test.ts"
    );
    const after = collectTests(
      `it.each([1, 2, 3])("x %s", (n) => {});\nit.each\`a\${2}\`("y", () => {});`,
      "a.test.ts"
    );

    assert.notEqual(before.get("x %s")?.body, after.get("x %s")?.body);
    assert.notEqual(before.get("y")?.body, after.get("y")?.body);
  });

  it("keeps same-titled tests apart", () => {
    const tests = collectTests(
      `it("x", () => { a(); });\nit("x", () => { b(); });`,
      "a.test.ts"
    );

    assert.deepEqual([...tests.keys()], ["x", "x #2"]);
  });
});

describe("diffTests", () => {
  it("classifies tests as added, changed, removed or unchanged", () => {
    const test = (name: string, body: string, line: number) =>
      [name, { groups: [], name, body, line }] as const;
    const before = new Map([
      test("kept", "a", 1),
      test("edited", "b", 2),
      test("dropped", "c", 3),
    ]);
    const after = new Map([
      test("kept", "a", 1),
      test("edited", "b2", 2),
      test("new", "d", 5),
    ]);

    assert.deepEqual(diffTests("a.test.ts", null, before, after), {
      path: "a.test.ts",
      source: null,
      added: [{ groups: [], name: "new", line: 5 }],
      changed: [{ groups: [], name: "edited", line: 2 }],
      removed: [{ groups: [], name: "dropped", line: 3 }],
      unchanged: [{ groups: [], name: "kept", line: 1 }],
    });
  });
});

describe("renderSummary", () => {
  it("links added tests to the new side of the diff, removed ones to the old side and untouched ones to the head file", () => {
    const body = renderSummary(
      [
        {
          path: "a.test.ts",
          source: null,
          added: [{ groups: [], name: "new", line: 5 }],
          changed: [],
          removed: [{ groups: [], name: "dropped", line: 3 }],
          unchanged: [{ groups: [], name: "kept", line: 1 }],
        },
      ],
      [],
      {
        pullUrl: "https://github.com/o/r/pull/7",
        repoUrl: "https://github.com/o/r",
        headSha: "abc",
      }
    );
    const fileHash = createHash("sha256").update("a.test.ts").digest("hex");

    assert.ok(
      body.includes(
        `new <sub>[L5](https://github.com/o/r/pull/7/files#diff-${fileHash}R5)</sub>`
      )
    );
    assert.ok(
      body.includes(
        `~~dropped~~ <sub>[L3](https://github.com/o/r/pull/7/files#diff-${fileHash}L3)</sub>`
      )
    );
    assert.ok(
      body.includes(
        "kept <sub>[L1](https://github.com/o/r/blob/abc/a.test.ts#L1)</sub>"
      )
    );
  });
});

describe("truncateSummary", () => {
  it("cuts on a line boundary and closes open collapsed sections", () => {
    const summary = `head\n<details><summary>s</summary>\n\n${"[link](url)\n".repeat(10)}</details>`;
    // The limit falls in the middle of the second link.
    const truncated = truncateSummary(summary, 55);

    assert.equal(
      truncated,
      "head\n<details><summary>s</summary>\n\n[link](url)\n\n</details>\n\n_Summary truncated: run the script locally for the full list._"
    );
  });
});
