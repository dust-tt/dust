import { extractFileRefs } from "@app/lib/api/viz/extract_file_refs";
import { describe, expect, it } from "vitest";

describe("extractFileRefs", () => {
  it("extracts file IDs from useFile() calls", () => {
    const code = `
      function Comp() {
        const f = useFile("fil_ABCDEFGHIJ");
        return f;
      }
    `;
    expect(extractFileRefs(code)).toEqual([
      { type: "fileId", fileId: "fil_ABCDEFGHIJ" },
    ]);
  });

  it("extracts file IDs from fileId JSX attributes", () => {
    const code = `
      function Comp() {
        return <Image fileId="fil_XYZ1234567" />;
      }
    `;
    expect(extractFileRefs(code)).toEqual([
      { type: "fileId", fileId: "fil_XYZ1234567" },
    ]);
  });

  it("extracts file IDs from any string literal", () => {
    const code = `const s = "fil_ABCDEFGHIJ";`;
    expect(extractFileRefs(code)).toEqual([
      { type: "fileId", fileId: "fil_ABCDEFGHIJ" },
    ]);
  });

  it("extracts scoped paths from string literals (conversation/)", () => {
    const code = `const path = "conversation/abc/file.csv";`;
    expect(extractFileRefs(code)).toEqual([
      { type: "path", scopedPath: "conversation/abc/file.csv" },
    ]);
  });

  it("extracts scoped paths from string literals (project/)", () => {
    const code = `const path = "project/abc/file.csv";`;
    expect(extractFileRefs(code)).toEqual([
      { type: "path", scopedPath: "project/abc/file.csv" },
    ]);
  });

  it("extracts scoped paths from string literals (pod/)", () => {
    const code = `const path = "pod/abc/file.csv";`;
    expect(extractFileRefs(code)).toEqual([
      { type: "path", scopedPath: "pod/abc/file.csv" },
    ]);
  });

  // Canonical, portable scopes are the form frame code is INSTRUCTED to use
  // (bare `conversation/` and `pod/` are explicitly discouraged). These must be
  // extracted so the public-share prefetch can fetch them.
  it("extracts canonical conversation scope from useFile (conversation-{id}/)", () => {
    const code = `const f = useFile("conversation-conv_123/report.csv");`;
    expect(extractFileRefs(code)).toEqual([
      { type: "path", scopedPath: "conversation-conv_123/report.csv" },
    ]);
  });

  it("extracts canonical pod scope from string literals (pod-{id}/)", () => {
    const code = `const path = "pod-pod_456/notes.md";`;
    expect(extractFileRefs(code)).toEqual([
      { type: "path", scopedPath: "pod-pod_456/notes.md" },
    ]);
  });

  it("extracts canonical conversation scope from import specifiers", () => {
    const code = `import MyFrame from "conversation-conv_123/MyFrame.tsx";`;
    expect(extractFileRefs(code)).toEqual([
      { type: "path", scopedPath: "conversation-conv_123/MyFrame.tsx" },
    ]);
  });

  it("ignores canonical prefixes with an empty id", () => {
    const code = `
      const a = "conversation-/file.csv";
      const b = "pod-/file.csv";
    `;
    expect(extractFileRefs(code)).toEqual([]);
  });

  it("deduplicates refs across visitors", () => {
    const code = `
      function Comp() {
        useFile("fil_ABCDEFGHIJ");
        return <Image fileId="fil_ABCDEFGHIJ" />;
      }
    `;
    expect(extractFileRefs(code)).toEqual([
      { type: "fileId", fileId: "fil_ABCDEFGHIJ" },
    ]);
  });

  it("extracts file IDs and scoped paths from import specifiers", () => {
    const code = `
      import data from "fil_ABCDEFGHIJ";
      import { thing } from "fil_BBBBBBBBBB";
      const lazy = import("fil_CCCCCCCCCC");
      export * from "fil_DDDDDDDDDD";
      const csv = require("conversation/abc/data.csv");
    `;
    expect(extractFileRefs(code)).toEqual([
      { type: "fileId", fileId: "fil_ABCDEFGHIJ" },
      { type: "fileId", fileId: "fil_BBBBBBBBBB" },
      { type: "fileId", fileId: "fil_CCCCCCCCCC" },
      { type: "fileId", fileId: "fil_DDDDDDDDDD" },
      { type: "path", scopedPath: "conversation/abc/data.csv" },
    ]);
  });

  it("ignores non-matching string literals", () => {
    const code = `
      const a = "hello world";
      const b = "fil_TOO_SHORT";
      const c = "/conversation/wrong-prefix";
    `;
    expect(extractFileRefs(code)).toEqual([]);
  });

  it("recovers refs from code with spec-level syntax errors", () => {
    // `a ?? b || c` without parens is a SyntaxError per the JS spec — this is
    // the pattern AI-generated frame code occasionally emits.
    const code = `
      function Comp() {
        const f = useFile("fil_ABCDEFGHIJ");
        const broken = a ?? b || c;
        return <Image fileId="fil_XYZ1234567" path="conversation/x/y.csv" />;
      }
    `;
    const refs = extractFileRefs(code);
    expect(refs).toEqual(
      expect.arrayContaining([
        { type: "fileId", fileId: "fil_ABCDEFGHIJ" },
        { type: "fileId", fileId: "fil_XYZ1234567" },
        { type: "path", scopedPath: "conversation/x/y.csv" },
      ])
    );
    expect(refs).toHaveLength(3);
  });

  it("returns an empty array for completely unparseable input without throwing", () => {
    const code = "@@@ not even javascript @@@";
    expect(() => extractFileRefs(code)).not.toThrow();
    expect(extractFileRefs(code)).toEqual([]);
  });

  it("returns refs in the order they're first seen", () => {
    const code = `
      useFile("fil_AAAAAAAAAA");
      const p = "conversation/foo/bar.txt";
      useFile("fil_BBBBBBBBBB");
    `;
    expect(extractFileRefs(code)).toEqual([
      { type: "fileId", fileId: "fil_AAAAAAAAAA" },
      { type: "path", scopedPath: "conversation/foo/bar.txt" },
      { type: "fileId", fileId: "fil_BBBBBBBBBB" },
    ]);
  });
});
