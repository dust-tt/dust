import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDrizzleKitBin } from "./schema.ts";

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "dsbx-schema-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function makeBin(path: string): Promise<string> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "");
  return path;
}

describe("resolveDrizzleKitBin", () => {
  test("prefers the image install when both exist", async () => {
    await withDir(async (dir) => {
      const imageBin = await makeBin(join(dir, "image", "drizzle-kit"));
      const localBin = await makeBin(join(dir, "local", "drizzle-kit"));

      const result = resolveDrizzleKitBin({ imageBin, localBin });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(imageBin);
      }
    });
  });

  test("falls back to the local .bin when the image install is absent", async () => {
    await withDir(async (dir) => {
      const localBin = await makeBin(join(dir, "local", "drizzle-kit"));

      const result = resolveDrizzleKitBin({
        imageBin: join(dir, "image", "drizzle-kit"),
        localBin,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(localBin);
      }
    });
  });

  test("errors naming both candidates when neither exists", async () => {
    await withDir(async (dir) => {
      const imageBin = join(dir, "image", "drizzle-kit");
      const localBin = join(dir, "local", "drizzle-kit");

      const result = resolveDrizzleKitBin({ imageBin, localBin });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.kind).toBe("internal");
        expect(result.error.message).toContain(imageBin);
        expect(result.error.message).toContain(localBin);
      }
    });
  });
});
