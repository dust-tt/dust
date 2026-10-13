// @vitest-environment node

import { Readable } from "node:stream";

import {
  buildFrameSourceTarArchive,
  computeFrameSourcePathSetSha256,
} from "@app/lib/api/frames/source_staging";
import { Parser } from "tar";
import { describe, expect, it } from "vitest";

describe("buildFrameSourceTarArchive", () => {
  it("packs relative paths as uncompressed ustar entries", async () => {
    const archive = await buildFrameSourceTarArchive([
      {
        relativePath: "index.tsx",
        content: Buffer.from("export default function App() {}"),
      },
      {
        relativePath: "functions/add_task.ts",
        content: Buffer.from("export async function run() {}"),
      },
    ]);

    const entries = new Map<string, string>();
    const parser = new Parser();
    await new Promise<void>((resolve, reject) => {
      parser.on("entry", (entry) => {
        if (entry.type !== "File") {
          entry.resume();
          return;
        }
        const chunks: Buffer[] = [];
        entry.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        entry.on("end", () => {
          entries.set(
            entry.path.replace(/^\.\//, ""),
            Buffer.concat(chunks).toString("utf8")
          );
        });
      });
      parser.on("end", () => resolve());
      parser.on("error", reject);
      Readable.from(archive).pipe(parser);
    });

    expect(entries.get("index.tsx")).toBe("export default function App() {}");
    expect(entries.get("functions/add_task.ts")).toBe(
      "export async function run() {}"
    );
  });
});

describe("computeFrameSourcePathSetSha256", () => {
  it("is order-independent", () => {
    expect(computeFrameSourcePathSetSha256(["b.ts", "a.ts"])).toBe(
      computeFrameSourcePathSetSha256(["a.ts", "b.ts"])
    );
  });
});
