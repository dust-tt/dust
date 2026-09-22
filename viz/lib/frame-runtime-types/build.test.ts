import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FRAME_RUNTIME_IMPORT_NAMES } from "@viz/app/lib/frame-runtime-imports";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFrameRuntimeTypes } from "./build";

const vizRoot = path.resolve(__dirname, "../..");
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "frame-runtime-types-test-")
);
const outDir = path.join(root, "public");
const artifactRoot = path.join(root, "extracted");

beforeAll(async () => {
  const manifest = await buildFrameRuntimeTypes({ vizRoot, outDir });
  fs.mkdirSync(artifactRoot);
  execFileSync("tar", [
    "-xzf",
    path.join(outDir, path.basename(manifest.path)),
    "-C",
    artifactRoot,
  ]);
}, 30_000);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function check(source: Record<string, string>) {
  const projectRoot = fs.mkdtempSync(path.join(root, "project-"));
  for (const [fileName, content] of Object.entries(source)) {
    const target = path.join(projectRoot, fileName);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const configPath = path.join(projectRoot, "tsconfig.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      extends: "../extracted/tsconfig.json",
      files: ["index.tsx"],
    })
  );
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    projectRoot
  );
  expect(parsed.errors).toEqual([]);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const position = diagnostic.file?.getLineAndCharacterOfPosition(
      diagnostic.start ?? 0
    );
    return {
      code: diagnostic.code,
      file:
        diagnostic.file && path.relative(projectRoot, diagnostic.file.fileName),
      line: position && position.line + 1,
      column: position && position.character + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    };
  });
}

describe("Frame runtime declaration artifact", () => {
  it("works outside the repository with real runtime libraries and current and legacy hooks", () => {
    expect(
      check({
        "index.tsx": `
import { useState, type ReactNode } from "react";
import { Button } from "shadcn";
import { LineChart } from "recharts";
import { parse } from "papaparse";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "utils";
import { cn as currentCn } from "@viz/lib/utils";
import * as slideshowV1 from "@dust/slideshow/v1";
import * as slideshowV2 from "@dust/slideshow/v2";
import { captureScreenshot, triggerUserFileDownload, useFrameFunction, usePodFunction, SandboxFunctionCallError, useFile, readFile, writeFile } from "@dust/react-hooks";
async function editFile() {
  const file = await readFile("./notes.json");
  if (file?.canWrite && file.revision) {
    const content: string = await file.file.text();
    const result = await writeFile(file.file.name, content, { revision: file.revision });
    if (result.success) {
      const revision: string = result.revision;
    } else {
      const message: string = result.error.message;
    }
  }
}
const fileHook: (path: string) => File | null = useFile;
const legacy: typeof useFrameFunction = usePodFunction;
const child: ReactNode = "hello";
const screenshot: Promise<void> = captureScreenshot();
const download: Promise<void> = triggerUserFileDownload({ content: "hello" });
let error: SandboxFunctionCallError | undefined;
export default function App() {
  const [label] = useState("Hello");
  return <Button variant="outline">{label}</Button>;
}
`,
      })
    ).toEqual([]);
  });

  it.each([
    [
      'import { useFile } from "@dust/react-hooks"; export default () => useFile("./notes.json")?.revision',
      2339,
    ],
    [
      'import { writeFile } from "@dust/react-hooks"; writeFile("./notes.json", "{}"); export default () => null',
      2554,
    ],
    [
      'import { fakeThing } from "react"; export default () => <div>{fakeThing()}</div>',
      2305,
    ],
    [
      'import * as React from "react"; export default () => <div>{React.fakeThing()}</div>',
      2339,
    ],
    [
      'import { Button } from "shadcn"; export default () => <Button variant="wrong" />',
      2322,
    ],
    [
      'import { fakeHook } from "@dust/react-hooks"; export default () => <div>{fakeHook()}</div>',
      2305,
    ],
    [
      'import { captureScreenshot } from "@dust/react-hooks"; captureScreenshot(42); export default () => null',
      2345,
    ],
  ])("rejects broken library usage: %s", (code, diagnosticCode) => {
    expect(check({ "index.tsx": code })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "index.tsx",
          code: diagnosticCode,
          line: 1,
        }),
      ])
    );
  });

  it("preserves imported filenames and JavaScript parser mode", () => {
    expect(
      check({
        "index.tsx":
          'import { value } from "./value.ts"; export default () => <div>{value}</div>',
        "value.ts": '// Original source\nexport const value: number = "wrong"',
      })
    ).toEqual([
      expect.objectContaining({
        file: "value.ts",
        code: 2322,
        line: 2,
        column: 14,
      }),
    ]);
    expect(
      check({
        "index.tsx":
          'import { value } from "./value.js"; export default () => <div>{value}</div>',
        "value.js": "export const value: number = 1",
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "value.js",
          code: 8010,
          line: 1,
          column: 21,
        }),
      ])
    );
  });

  it("accepts dynamic file references and excludes Node globals", () => {
    expect(
      check({
        "index.tsx": `
import data from "conversation-abc/report.csv";
import child from "fil_0123456789ab";
import legacy from "project/data.json";
export default () => <div>{data[0]}{legacy.title}{child?.name}</div>
`,
      })
    ).toEqual([]);
    expect(
      check({ "index.tsx": "export default () => <div>{process.pid}</div>" })
    ).toEqual([
      expect.objectContaining({
        file: "index.tsx",
        message: expect.stringContaining("Cannot find name 'process'"),
      }),
    ]);
  });

  it("publishes a stable tree identity and a checksum for the actual archive", async () => {
    const previous = fs.readFileSync(
      path.join(outDir, "manifest.json"),
      "utf8"
    );
    const manifest = await buildFrameRuntimeTypes({ vizRoot, outDir });
    expect(fs.existsSync(path.join(artifactRoot, "index.d.ts"))).toBe(true);
    expect(fs.existsSync(path.join(artifactRoot, "viz/app"))).toBe(false);
    expect(manifest.modules).toEqual([...FRAME_RUNTIME_IMPORT_NAMES]);
    expect(manifest.typescriptVersion).toBe(ts.version);
    expect(previous).toContain(`"id": "${manifest.id}"`);
    const archivePath = path.join(outDir, path.basename(manifest.path));
    const archive = fs.readFileSync(archivePath);
    expect(manifest.tarballSha256).toBe(
      createHash("sha256").update(archive).digest("hex")
    );
    expect(manifest.sizeBytes).toBe(archive.length);
    const entries = execFileSync("tar", ["-tzf", archivePath], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(
      entries.every(
        (file) => file.endsWith("/") || /(?:\.d\.[cm]?ts|\.json)$/.test(file)
      )
    ).toBe(true);
  }, 30_000);

  it("fails when runtime declarations cannot be generated", async () => {
    await expect(
      buildFrameRuntimeTypes({ vizRoot: path.join(root, "missing"), outDir })
    ).rejects.toThrow();
  });
});
