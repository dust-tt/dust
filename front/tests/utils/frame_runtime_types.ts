import fs from "node:fs";
import path from "node:path";
import type { FrameValidationSnapshot } from "@app/lib/api/viz/frame_type_checker_types";
import ts from "typescript";
import { vi } from "vitest";

const originalFetch = globalThis.fetch;

// Mock only the external Viz response. The worker and TypeScript checker run normally.
export function mockFrameRuntimeTypes() {
  const libDirectory = path.dirname(ts.getDefaultLibFilePath({}));
  const files = Object.fromEntries(
    fs
      .readdirSync(libDirectory)
      .filter(
        (fileName) => fileName.startsWith("lib.") && fileName.endsWith(".d.ts")
      )
      .map((fileName) => [
        `/frame-types/${fileName}`,
        fs.readFileSync(path.join(libDirectory, fileName), "utf8"),
      ])
  );
  const snapshot: FrameValidationSnapshot = {
    typescriptVersion: ts.version,
    defaultLibFileName: "/frame-types/lib.d.ts",
    modules: {
      react: "/frame-types/react.d.ts",
      recharts: "/frame-types/recharts.d.ts",
    },
    files: {
      ...files,
      "/frame-types/react.d.ts": `export as namespace React;
export function useState<T>(initial: T): [T, (value: T) => void];
export function createElement(...args: any[]): any;
export namespace JSX { interface IntrinsicElements { [name: string]: any } }
`,
      "/frame-types/recharts.d.ts": `export function LineChart(props: any): any;
export function Line(props: any): any;`,
      "/frame-types/dust-file-refs.d.ts": 'declare module "fil_*"',
    },
  };
  const body = JSON.stringify({ schemaVersion: 1, snapshot });
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (String(input).endsWith("/frame-runtime-types.json")) {
      return Promise.resolve(
        new Response(body, { headers: { etag: '"frame-types-test"' } })
      );
    }
    return originalFetch(input, init);
  });
}
