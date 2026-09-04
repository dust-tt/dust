import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FRAME_RUNTIME_IMPORT_NAMES } from "@viz/app/lib/frame-runtime-imports";
import { buildFrameRuntimeTypes } from "@viz/app/lib/frame-runtime-types/build";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const VIZ_ROOT = path.resolve(__dirname, "../../..");

let workDir: string;
let runtimeDir: string;
let stagingDir: string;

/**
 * Type-checks a Frame the way Front does in the sandbox: the artifact's tsconfig is extended by a
 * scratch tsconfig whose only root is an entry-check file importing the Frame's entry point.
 */
function checkFrame(
  files: Record<string, string>,
  entryRelPath = "index.tsx"
): string[] {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(stagingDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  const entryCheckPath = path.join(workDir, "entry-check.tsx");
  const entryImportPath = path.join(
    stagingDir,
    entryRelPath.replace(/\.(?:tsx|ts|jsx|js)$/, "")
  );
  fs.writeFileSync(
    entryCheckPath,
    `import FrameComponent from ${JSON.stringify(entryImportPath)};\n` +
      "export const entryCheck = <FrameComponent />;\n"
  );
  const parsed = ts.parseJsonConfigFileContent(
    {
      extends: path.join(runtimeDir, "tsconfig.json"),
      compilerOptions: { noEmit: true },
      files: [entryCheckPath],
    },
    ts.sys,
    workDir
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });

  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );
}

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-runtime-types-test-"));
  runtimeDir = path.join(workDir, "runtime");
  stagingDir = path.join(workDir, "frame");
  const outDir = path.join(workDir, "out");
  const manifest = buildFrameRuntimeTypes({ vizRoot: VIZ_ROOT, outDir });

  expect(manifest.path).toBe(`/frame-runtime/${manifest.id}.tgz`);
  expect(fs.readdirSync(outDir).sort()).toEqual([
    `${manifest.id}.tgz`,
    "manifest.json",
  ]);
  expect(
    JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"))
  ).toEqual(manifest);

  fs.mkdirSync(runtimeDir);
  execFileSync("tar", [
    "-xzf",
    path.join(outDir, `${manifest.id}.tgz`),
    "-C",
    runtimeDir,
  ]);
}, 120_000);

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("buildFrameRuntimeTypes", () => {
  it("maps every runtime import name to a declaration inside the artifact", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(runtimeDir, "tsconfig.json"), "utf8")
    );
    for (const importName of FRAME_RUNTIME_IMPORT_NAMES) {
      const [target] = tsconfig.compilerOptions.paths[importName];
      expect(target, importName).toMatch(/^\.\//);
      expect(fs.existsSync(path.join(runtimeDir, target)), importName).toBe(
        true
      );
    }
  });

  it("accepts a typed multi-file Frame using every runtime module", () => {
    const diagnostics = checkFrame({
      "index.tsx": `import { useState } from "react";
import { LineChart } from "recharts";
import { Circle } from "lucide-react";
import { motion } from "motion/react";
import Papa from "papaparse";
import { Button, Card } from "shadcn";
import { cn } from "@viz/lib/utils";
import { usePodFunction, useFile, triggerUserFileDownload } from "@dust/react-hooks";
import data from "./data.json";
import type { Props } from "./types";
import attachment from "conversation-conv_123/data.csv";
export default function App(_props: Props) {
  const [count] = useState<number>(1);
  const result = usePodFunction("list-items", {});
  const file = useFile("fil_abcdefghij");
  const parsed = Papa.parse<string[]>("a,b");
  return (
    <Card className={cn("p-2")}>
      <Circle />
      <motion.div />
      <LineChart width={1} height={1} data={[]} />
      <Button onClick={() => triggerUserFileDownload({ content: "x" })}>
        {data.label}{count}{String(result.data)}{file?.name}{parsed.data.length}{String(attachment)}
      </Button>
    </Card>
  );
}`,
      "data.json": JSON.stringify({ label: "Hello" }),
      "types.ts": "export interface Props { title?: string }",
    });

    expect(diagnostics).toEqual([]);
  }, 60_000);

  it("rejects imports the runtime does not provide", () => {
    expect(
      checkFrame({
        "index.tsx": `import { Avatar } from "@/components/ui/avatar";
export default function App() { return <Avatar />; }`,
      })
    ).toEqual([
      "Cannot find module '@/components/ui/avatar' or its corresponding type declarations.",
    ]);
    expect(
      checkFrame({
        "index.tsx": `import { DefinitelyMissing } from "shadcn";
export default function App() { return <DefinitelyMissing />; }`,
      })
    ).toEqual([
      "Module '\"shadcn\"' has no exported member 'DefinitelyMissing'.",
    ]);
    expect(
      checkFrame({
        "index.tsx": `import { definitelyMissing } from "@dust/react-hooks";
export default function App() { return <main>{String(definitelyMissing)}</main>; }`,
      })
    ).toEqual([
      "Module '\"@dust/react-hooks\"' has no exported member 'definitelyMissing'.",
    ]);
  }, 60_000);

  it("reports type errors and invalid entry components", () => {
    expect(
      checkFrame({
        "index.tsx": `const count: number = "one";
export default function App() { return <main>{count}</main>; }`,
      })
    ).toEqual(["Type 'string' is not assignable to type 'number'."]);
    expect(
      checkFrame({
        "index.tsx": `export default function App({ title }: { title: string }) { return <main>{title}</main>; }`,
      })
    ).toEqual([
      "Property 'title' is missing in type '{}' but required in type '{ title: string; }'.",
    ]);
  }, 60_000);
});
