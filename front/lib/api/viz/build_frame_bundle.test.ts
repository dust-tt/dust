// @vitest-environment node
// esbuild relies on `new TextEncoder().encode("") instanceof Uint8Array`, which is false under
// jsdom (cross-realm Uint8Array). Run this file in the node environment. Production runs the
// bundler in the front Node server, so this only affects tests.
//
// Generic bundling (resolution, externals, async/multi-level loading, diamond dedup, JSON, error
// cases, non-JSX entries) is covered by the engine suite in `lib/api/bundler/bundle_module.test.ts`.
// This file covers source syntax validation, JSX source-location tagging, and viz options.

import type { FrameSourceReader } from "@app/lib/api/viz/build_frame_bundle";
import { buildFrameBundle } from "@app/lib/api/viz/build_frame_bundle";
import { describe, expect, it } from "vitest";

function inMemoryReader(files: Record<string, string>): FrameSourceReader {
  return {
    list: async () => Object.keys(files),
    read: async (rel) => (rel in files ? files[rel] : null),
  };
}

// A multi-file frame so we can assert tags carry each element's true origin file.
const MULTI_FILE_FRAME: Record<string, string> = {
  "dashboard.tsx": `
import { Chart } from "./components/Chart";

export default function Dashboard() {
  return (
    <div className="p-4">
      <h1>Sales</h1>
      <Chart />
    </div>
  );
}
`,
  "components/Chart.tsx": `
import { LineChart, Line } from "recharts";

export function Chart() {
  return (
    <LineChart width={300} height={150} data={[{ x: 1, y: 2 }]}>
      <Line dataKey="y" />
    </LineChart>
  );
}
`,
};

async function build(files: Record<string, string>, entry = "dashboard.tsx") {
  return buildFrameBundle({
    entryRelPath: entry,
    reader: inMemoryReader(files),
  });
}

describe("buildFrameBundle", () => {
  it("stamps source-location tags carrying each element's origin file", async () => {
    const result = await build(MULTI_FILE_FRAME);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const { code } = result.value;

    expect(code).toMatch(/data-source="dashboard\.tsx:\d+:\d+"/);
    expect(code).toMatch(/data-source="components\/Chart\.tsx:\d+:\d+"/);
  });

  it("preserves JSX and keeps non-relative specifiers external (viz options)", async () => {
    const result = await build(MULTI_FILE_FRAME);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const { code } = result.value;

    // JSX is preserved (react-runner transpiles at render), not compiled to createElement.
    expect(code).toContain("<LineChart");
    // The charting lib stays external for the viz import scope.
    expect(code).toMatch(/from\s+["']recharts["']/);
    // The relative sibling was inlined (no relative import remains).
    expect(code).not.toMatch(/["']\.\/components\/Chart["']/);
  });

  it("tags a single self-contained frame", async () => {
    const single = {
      "main.tsx": `export default function M() { return <p>hi</p>; }`,
    };
    const result = await build(single, "main.tsx");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.code).toContain("data-source=");
    }
  });

  it("rejects malformed TSX with source diagnostics before JSX tagging", async () => {
    const result = await build({
      "dashboard.tsx": "export default () => <div><span>Hello</div>;",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_syntax");
      expect(result.error.message).toContain("dashboard.tsx:");
      expect(result.error.message).toContain(
        "TypeScript syntax errors detected"
      );
      expect(result.error.message).toContain(
        "Line 1, Column 28: error TS17008"
      );
    }
  });

  it("rejects syntax errors in imported sources with their original locations", async () => {
    const result = await build({
      "dashboard.tsx":
        'import { value } from "./value"; export default () => <div>{value}</div>;',
      "value.ts": "// Imported data.\nexport const value = ;",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_syntax");
      expect(result.error.message).toContain("value.ts:");
      expect(result.error.message).toContain("Line 2, Column 22: error TS1109");
    }
  });

  it("skips syntax validation for assets and unrelated sources", async () => {
    const result = await build({
      "dashboard.tsx":
        'import data from "./data.json"; export default () => <div>{data.title}</div>;',
      "data.json": '{"title":"Sales"}',
      "unrelated.tsx": "export default () => <div>broken",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.code).toContain("Sales");
    }
  });
});
