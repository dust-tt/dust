// @vitest-environment node
// esbuild relies on `new TextEncoder().encode("") instanceof Uint8Array`, which is false under
// jsdom (cross-realm Uint8Array). Run this file in the node environment. Production runs the
// bundler in the front Node server, so this only affects tests.

import type {
  BundleEsbuildOptions,
  SourceReader,
} from "@app/lib/api/bundler/bundle_module";
import { bundleModule } from "@app/lib/api/bundler/bundle_module";
import { setTimeoutAync } from "@app/lib/utils/async_utils";
import { describe, expect, it } from "vitest";

// Default output options for the generic suite. Individual tests override (e.g. node platform for
// the Function case) to prove the engine is not tied to one consumer's settings.
const ESM_BROWSER: BundleEsbuildOptions = {
  format: "esm",
  platform: "browser",
  jsx: "preserve",
  minify: false,
};

function inMemoryReader(files: Record<string, string>): SourceReader {
  return {
    list: async () => Object.keys(files),
    read: async (rel) => (rel in files ? files[rel] : null),
  };
}

// A reader whose reads resolve asynchronously with per-file, deliberately out-of-order delays.
// This exercises the engine's async resolution across several nesting levels: deeper files are
// made to resolve FIRST, so the build cannot rely on read ordering matching import order. It also
// records which files were read, so tests can assert the dependency graph was fully walked.
function asyncLatencyReader(files: Record<string, string>): {
  reader: SourceReader;
  reads: string[];
} {
  const reads: string[] = [];
  // Shorter paths (the entry) wait longer, so reads complete in roughly reverse-dependency order.
  const delayMsFor = (rel: string) => Math.max(1, 30 - rel.length);
  const reader: SourceReader = {
    list: async () => {
      await setTimeoutAync(1);
      return Object.keys(files);
    },
    read: async (rel) => {
      await setTimeoutAync(delayMsFor(rel));
      reads.push(rel);
      return rel in files ? files[rel] : null;
    },
  };
  return { reader, reads };
}

// A module whose entry pulls a nested sibling and a cross-dir util, an external lib, and a data
// ref. Mirrors a realistic multi-file source tree authored against the engine.
const MULTI_FILE_MODULE: Record<string, string> = {
  "dashboard.tsx": `
import React from "react";
import { Chart } from "./components/Chart";
import { useFile } from "@dust/react-hooks";

export default function Dashboard() {
  const [count] = React.useState(0);
  const data = useFile("fil_abcdefghij");
  return (
    <div className="p-4">
      <h1>Sales {count}</h1>
      <Chart />
    </div>
  );
}
`,
  "components/Chart.tsx": `
import { LineChart, Line } from "recharts";
import { palette } from "../theme";

interface ChartProps { title?: string; }

export function Chart({ title }: ChartProps) {
  return (
    <LineChart width={300} height={150} data={[{ x: 1, y: 2 }]}>
      <Line dataKey="y" stroke={palette.primary} />
    </LineChart>
  );
}
`,
  "theme.ts": `export const palette = { primary: "#3366ff" };\n`,
};

async function build(
  files: Record<string, string>,
  entry = "dashboard.tsx",
  {
    esbuild = ESM_BROWSER,
    transform,
  }: {
    esbuild?: BundleEsbuildOptions;
    transform?: (relPath: string, content: string) => string;
  } = {}
) {
  return bundleModule({
    entryRelPath: entry,
    reader: inMemoryReader(files),
    esbuild,
    transform,
  });
}

describe("bundleModule", () => {
  it("inlines relative imports and keeps non-relative specifiers external", async () => {
    const result = await build(MULTI_FILE_MODULE);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const { code } = result.value;

    // Externals preserved as imports for the runtime import scope to resolve.
    expect(code).toMatch(/from\s+["']react["']/);
    expect(code).toMatch(/from\s+["']recharts["']/);
    expect(code).toMatch(/from\s+["']@dust\/react-hooks["']/);

    // Relative siblings inlined (no relative import statements remain).
    expect(code).not.toMatch(/["']\.\/components\/Chart["']/);
    expect(code).not.toMatch(/["']\.\.\/theme["']/);
    // Cross-dir util content made it into the bundle.
    expect(code).toContain("#3366ff");
  });

  it("preserves data refs and JSX, and strips TS types", async () => {
    const result = await build(MULTI_FILE_MODULE);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const { code } = result.value;

    expect(code).toContain("fil_abcdefghij");
    expect(code).toContain("<LineChart");
    expect(code).not.toContain("interface ChartProps");
  });

  it("builds a single self-contained file with no relative imports", async () => {
    const single = {
      "main.tsx": `export default function M() { return <p>hi</p>; }`,
    };
    const result = await build(single, "main.tsx");
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.code).toContain("<p");
  });

  it("returns entry_not_found when the entry is missing", async () => {
    const result = await build(MULTI_FILE_MODULE, "missing.tsx");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("entry_not_found");
    }
  });

  it("rejects relative imports that escape the module root", async () => {
    const files = {
      "dashboard.tsx": `import { secret } from "../../outside/secret";\nexport default () => <div>{secret}</div>;\n`,
    };
    const result = await build(files);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("build_failed");
      expect(result.error.message).toContain("outside module root");
    }
  });

  it("fails the build when a relative import cannot be resolved", async () => {
    const files = {
      "dashboard.tsx": `import { X } from "./nope";\nexport default () => <div>{X}</div>;\n`,
    };
    const result = await build(files);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("build_failed");
    }
  });

  it("surfaces read_failed when a listed file cannot be read", async () => {
    // `ghost.tsx` is listed but reads as null (e.g. deleted between list and read).
    const reader: SourceReader = {
      list: async () => ["dashboard.tsx", "ghost.tsx"],
      read: async (rel) =>
        rel === "dashboard.tsx"
          ? `import { G } from "./ghost";\nexport default () => <div>{G}</div>;\n`
          : null,
    };
    const result = await bundleModule({
      entryRelPath: "dashboard.tsx",
      reader,
      esbuild: ESM_BROWSER,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("read_failed");
    }
  });

  it("reports a syntax error as build_failed", async () => {
    const files = {
      "dashboard.tsx": `export default function Broken() { return <div> ; }`,
    };
    const result = await build(files);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("build_failed");
    }
  });

  it("resolves a deep relative import chain across several levels", async () => {
    // entry -> a -> b -> c -> leaf, each in a different directory.
    const files = {
      "entry.tsx": `import { a } from "./l1/a";\nexport default () => <div>{a()}</div>;\n`,
      "l1/a.ts": `import { b } from "../l2/b";\nexport const a = () => "a" + b();\n`,
      "l2/b.ts": `import { c } from "./deep/c";\nexport const b = () => "b" + c();\n`,
      "l2/deep/c.ts": `import { leaf } from "../../l3/leaf";\nexport const c = () => "c" + leaf();\n`,
      "l3/leaf.ts": `export const leaf = () => "LEAF_MARKER";\n`,
    };
    const result = await build(files, "entry.tsx");
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    // Every level's content reached the bundle, and no relative import statements remain.
    expect(result.value.code).toContain("LEAF_MARKER");
    expect(result.value.code).not.toMatch(/from\s+["']\.\.?\//);
  });

  it("loads files asynchronously and out of order across several levels", async () => {
    const files = {
      "entry.tsx": `import { a } from "./l1/a";\nexport default () => <div>{a()}</div>;\n`,
      "l1/a.ts": `import { b } from "../l2/b";\nexport const a = () => "a" + b();\n`,
      "l2/b.ts": `export const b = () => "DEEP_ASYNC_MARKER";\n`,
    };
    const { reader, reads } = asyncLatencyReader(files);
    const result = await bundleModule({
      entryRelPath: "entry.tsx",
      reader,
      esbuild: ESM_BROWSER,
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    // The async, out-of-order reads still produced a correct, fully-inlined bundle...
    expect(result.value.code).toContain("DEEP_ASYNC_MARKER");
    // ...and every file in the graph was actually read (no level skipped).
    expect(new Set(reads)).toEqual(
      new Set(["entry.tsx", "l1/a.ts", "l2/b.ts"])
    );
  });

  it("resolves directory imports via an index file", async () => {
    const files = {
      "dashboard.tsx": `import { Widget } from "./components";\nexport default () => <Widget />;\n`,
      "components/index.tsx": `export const Widget = () => <span>WIDGET_INDEX</span>;\n`,
    };
    const result = await build(files);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.code).toContain("WIDGET_INDEX");
    }
  });

  it("inlines an imported JSON module", async () => {
    const files = {
      "dashboard.tsx": `import config from "./config.json";\nexport default () => <div>{config.label}</div>;\n`,
      "config.json": `{ "label": "JSON_LABEL" }`,
    };
    const result = await build(files);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.code).toContain("JSON_LABEL");
    }
  });

  it("inlines a shared module imported via two paths (diamond) without duplication", async () => {
    const files = {
      "dashboard.tsx": `import { a } from "./a";\nimport { b } from "./b";\nexport default () => <div>{a() + b()}</div>;\n`,
      "a.ts": `import { shared } from "./shared";\nexport const a = () => shared() + "A";\n`,
      "b.ts": `import { shared } from "./shared";\nexport const b = () => shared() + "B";\n`,
      "shared.ts": `export const shared = () => "SHARED_ONCE";\n`,
    };
    const result = await build(files);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    // The shared util is bundled exactly once even though two modules import it.
    const occurrences = result.value.code.split("SHARED_ONCE").length - 1;
    expect(occurrences).toBe(1);
  });

  it("applies the per-file transform hook to every inlined source", async () => {
    // The transform is the engine's only consumer-specific seam (Frames use it for JSX tagging).
    // Prove it runs on every file in the graph, with the root-relative path.
    const files = {
      "entry.ts": `import { helper } from "./util/helper";\nexport const run = () => helper();\n`,
      "util/helper.ts": `export const helper = () => "BASE";\n`,
    };
    const seen: string[] = [];
    const result = await build(files, "entry.ts", {
      esbuild: {
        format: "esm",
        platform: "node",
        jsx: "transform",
        minify: false,
      },
      transform: (relPath, content) => {
        seen.push(relPath);
        // Inject a discoverable marker keyed by file so we can assert per-file application. Use a
        // legal comment (`/*! ... */`) so esbuild preserves it through bundling.
        return `/*! T:${relPath} */\n${content}`;
      },
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(new Set(seen)).toEqual(new Set(["entry.ts", "util/helper.ts"]));
    expect(result.value.code).toContain("T:entry.ts");
    expect(result.value.code).toContain("T:util/helper.ts");
  });

  it("bundles a non-JSX TypeScript entry for node (generic primitive, e.g. a Function)", async () => {
    // The engine is not frame-specific: a plain TS entry built for node, with relative imports and
    // an external dependency, bundles the same way. This is what the future Function build will use.
    const files = {
      "index.ts": `import { label } from "./meta";\nimport { z } from "zod";\nexport const handler = () => label + z.string().parse("x");\n`,
      "meta.ts": `export const label: string = "FUNCTION_MARKER";\n`,
    };
    const result = await build(files, "index.ts", {
      esbuild: {
        format: "esm",
        platform: "node",
        jsx: "transform",
        minify: false,
      },
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    // Relative util inlined, external kept for the runtime to resolve, types stripped.
    expect(result.value.code).toContain("FUNCTION_MARKER");
    expect(result.value.code).toMatch(/from\s+["']zod["']/);
    expect(result.value.code).not.toContain(": string");
  });
});
