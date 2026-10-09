import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  COMMENT_MARKER,
  collectTests,
  diffTests,
  renderSummary,
  siblingTestPath,
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
});

describe("diffTests", () => {
  it("classifies tests as added, changed, removed or unchanged", () => {
    const before = new Map([
      ["kept", { body: "a", line: 1 }],
      ["edited", { body: "b", line: 2 }],
      ["dropped", { body: "c", line: 3 }],
    ]);
    const after = new Map([
      ["kept", { body: "a", line: 1 }],
      ["edited", { body: "b2", line: 2 }],
      ["new", { body: "d", line: 5 }],
    ]);

    assert.deepEqual(diffTests("a.test.ts", [], before, after), {
      path: "a.test.ts",
      sources: [],
      added: [{ title: "new", line: 5 }],
      changed: [{ title: "edited", line: 2 }],
      removed: [{ title: "dropped", line: 3 }],
      unchanged: [{ title: "kept", line: 1 }],
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
          sources: ["a.ts"],
          added: [{ title: "new", line: 5 }],
          changed: [],
          removed: [{ title: "dropped", line: 3 }],
          unchanged: [{ title: "kept", line: 1 }],
        },
      ],
      []
    );

    assert.ok(body.startsWith(COMMENT_MARKER));
    assert.ok(body.indexOf("**removed**: dropped") < body.indexOf("➕ new"));
    assert.match(
      body,
      /<details><summary>1 already tested<\/summary>\n\n- kept/
    );
  });

  it("links touched tests to the PR diff and untouched ones to the head file", () => {
    const body = renderSummary(
      [
        {
          path: "a.test.ts",
          sources: [],
          added: [{ title: "new", line: 5 }],
          changed: [],
          removed: [{ title: "dropped", line: 3 }],
          unchanged: [{ title: "kept", line: 1 }],
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
      body.includes("- [kept](https://github.com/o/r/blob/abc/a.test.ts#L1)")
    );
  });
});
