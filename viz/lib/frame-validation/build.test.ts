import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateFrameSource } from "../../../front/lib/api/viz/frame_type_checker.ts";
import { buildFrameValidationSnapshot } from "./build.ts";

const snapshot = buildFrameValidationSnapshot(path.resolve(__dirname, "../.."));

function check(code: string, files: Record<string, string> = {}) {
  const source: Record<string, string> = { ...files, "index.tsx": code };
  return validateFrameSource({
    snapshot,
    entryPoint: "index.tsx",
    readSource: (relativePath) =>
      Object.hasOwn(source, relativePath) ? source[relativePath] : undefined,
  });
}

describe("Frame runtime type artifact", () => {
  it("accepts the actual runtime libraries and bound Dust hooks", () => {
    expect(
      check(`import { useState } from "react";
import { Button } from "shadcn";
import { LineChart } from "recharts";
import { callFunction, captureScreenshot, useFile, usePodFunction } from "@dust/react-hooks";
export default function App() {
  const [label] = useState("Hello");
  return <Button>{label}</Button>;
}`)
    ).toEqual([]);
  });

  it.each([
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
      'import { Slot } from "@radix-ui/react-slot"; export default () => <Slot />',
      2307,
    ],
  ])("rejects broken imports and props in %s", (code, diagnosticCode) => {
    expect(check(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "index.tsx",
          line: 1,
          code: diagnosticCode,
        }),
      ])
    );
  });

  it("keeps dynamic data imports valid without exposing Node globals", () => {
    expect(
      check(`import data from "conversation-abc/report.csv";
import child from "fil_0123456789ab";
import legacy from "project/data.json";
export default () => <div>{data[0]}{legacy.title}</div>`)
    ).toEqual([]);
    expect(check("export default () => <div>{process.pid}</div>")).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 2591 })])
    );
  });

  it("reports the original imported filename and leaves unrelated sources alone", () => {
    const diagnostics = check(
      'import { value } from "./value.ts"; export default () => <div>{value}</div>',
      {
        "value.ts": '// Original source\nexport const value: number = "wrong"',
        "unused.tsx": "export default () => <div>broken",
      }
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        file: "value.ts",
        line: 2,
        column: 14,
        code: 2322,
      }),
    ]);
  });

  it("does not execute Frame code or read libraries from the host filesystem", () => {
    expect(
      check(
        'import fs from "node:fs"; throw new Error("must not run"); export default () => null'
      )
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 2307 })])
    );
    expect(
      check('throw new Error("must not run"); export default () => null')
    ).toEqual([]);
  });
});
