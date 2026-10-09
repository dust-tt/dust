import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  COMMENT_MARKER,
  collectDefinitions,
  collectTests,
  diffTests,
  renderSummary,
  siblingTestPath,
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

    assert.equal(compact.get("x")?.body, spread.get("x")?.body);
  });

  it("records the line each test starts on", () => {
    const tests = collectTests(
      `describe("outer", () => {\n\n  it("x", () => {});\n});`,
      "a.test.ts"
    );

    assert.equal(tests.get("outer › x")?.line, 3);
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

describe("collectDefinitions", () => {
  it("records the line of each top-level function, class and variable", () => {
    const lines = collectDefinitions(
      `export function a() {}\nclass B {}\n\nexport const c = 1, d = 2;\nfunction outer() { function inner() {} }`,
      "a.ts"
    );

    assert.deepEqual(
      [...lines],
      [
        ["a", 1],
        ["B", 2],
        ["c", 4],
        ["d", 4],
        ["outer", 5],
      ]
    );
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

describe("siblingTestPath", () => {
  it("maps a source file to the test file next to it", () => {
    assert.equal(
      siblingTestPath("front/lib/api/oauth.ts"),
      "front/lib/api/oauth.test.ts"
    );
    assert.equal(
      siblingTestPath("front/components/Row.tsx"),
      "front/components/Row.test.tsx"
    );
  });
});

describe("renderSummary", () => {
  it("lists removed tests first and collapses unchanged ones", () => {
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
      []
    );

    assert.ok(body.startsWith(COMMENT_MARKER));
    assert.ok(body.indexOf("**removed**: dropped") < body.indexOf("➕ new"));
    assert.match(body, /<details><summary>1 already tested<\/summary>\n\nkept/);
  });

  it("links touched tests to the PR diff and untouched ones to the head file", () => {
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
        `➕ [new](https://github.com/o/r/pull/7/files#diff-${fileHash}R5)`
      )
    );
    assert.ok(
      body.includes(
        `**removed**: [dropped](https://github.com/o/r/pull/7/files#diff-${fileHash}L3)`
      )
    );
    assert.ok(
      body.includes("\n[kept](https://github.com/o/r/blob/abc/a.test.ts#L1)")
    );
  });

  it("links the file to its head blob and describe titles to the declarations they name", () => {
    const body = renderSummary(
      [
        {
          path: "a.test.ts",
          source: { path: "a.ts", lines: new Map([["parse", 12]]) },
          added: [],
          changed: [],
          removed: [],
          unchanged: [{ groups: ["parse", "edge cases"], name: "x", line: 4 }],
        },
      ],
      [],
      {
        pullUrl: "https://github.com/o/r/pull/7",
        repoUrl: "https://github.com/o/r",
        headSha: "abc",
      }
    );

    assert.ok(
      body.includes(
        "**[`a.test.ts`](https://github.com/o/r/blob/abc/a.test.ts)**"
      )
    );
    assert.ok(
      body.includes(
        "[parse](https://github.com/o/r/blob/abc/a.ts#L12) › edge cases › [x](https://github.com/o/r/blob/abc/a.test.ts#L4)"
      )
    );
  });
});

describe("truncateSummary", () => {
  it("cuts on a line boundary and closes open collapsed sections", () => {
    const summary = `head\n<details><summary>s</summary>\n\n${"[link](url)\n".repeat(10)}</details>`;
    const truncated = truncateSummary(summary, 60);

    assert.ok(
      truncated.includes("[link](url)\n\n</details>\n\n_Summary truncated")
    );
    assert.ok(!truncated.includes("[link](u\n"));
  });
});
