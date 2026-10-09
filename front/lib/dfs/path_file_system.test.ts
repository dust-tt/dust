import { DfsPathFileSystem } from "@app/lib/dfs/path_file_system";
// @vitest-environment node
import { InMemoryDfs } from "@app/tests/utils/dfs/InMemoryDfs";
import { DfsError, isDfsObjectId } from "@app/types/dfs";
import { Readable } from "stream";
import { describe, expect, it } from "vitest";

const WRITE_CHUNK_BYTES = 4;
const READ_CHUNK_BYTES = 3;

function setup(options: ConstructorParameters<typeof InMemoryDfs>[0] = {}) {
  const dfs = new InMemoryDfs({
    maxWriteBytesPerApply: WRITE_CHUNK_BYTES,
    ...options,
  });
  const fs = new DfsPathFileSystem(dfs, dfs.rootId, {
    readChunkBytes: READ_CHUNK_BYTES,
    writeChunkBytes: WRITE_CHUNK_BYTES,
  });
  return { dfs, fs };
}

async function readText(fs: DfsPathFileSystem, path: string) {
  const res = await fs.readBuffer(path);
  return res.isOk() ? res.value.toString() : `error:${res.error.code}`;
}

describe("DfsPathFileSystem", () => {
  it("creates missing parent directories in a single apply", async () => {
    const { dfs, fs } = setup();

    const res = await fs.mkdir("a/b/c", { recursive: true });

    expect(res.isOk() && res.value.directory).toBe(true);
    expect(dfs.paths()).toEqual(["/a", "/a/b", "/a/b/c"]);
    expect(dfs.applyCalls).toHaveLength(1);

    const again = await fs.mkdir("a/b/c", { recursive: true });
    expect(again.isOk()).toBe(true);
    const existing = await fs.mkdir("a/b/c");
    expect(existing.isErr() && existing.error.code).toBe("already_exists");
    const missingParent = await fs.mkdir("x/y");
    expect(missingParent.isErr() && missingParent.error.code).toBe("not_found");
  });

  it("writes and overwrites a small file in place, keeping its id", async () => {
    const { dfs, fs } = setup();

    const created = await fs.write("notes.txt", "abc", {
      mimeType: "text/plain",
    });
    const overwritten = await fs.write("notes.txt", "xy");

    expect(created.isOk() && overwritten.isOk()).toBe(true);
    if (created.isOk() && overwritten.isOk()) {
      expect(overwritten.value.id).toBe(created.value.id);
      expect(overwritten.value.size).toBe(2);
    }
    expect(await readText(fs, "notes.txt")).toBe("xy");
    expect(dfs.applyCalls).toHaveLength(2);
    const stat = await fs.stat("notes.txt", { includeMetadata: true });
    expect(stat.isOk() && stat.value?.metadata?.mimeType).toBe("text/plain");
  });

  it("uploads large streamed content in chunks and swaps it in atomically", async () => {
    const { dfs, fs } = setup();
    const original = await fs.write("data.bin", "old");

    const res = await fs.write(
      "data.bin",
      Readable.from([
        Buffer.from("01234"),
        Buffer.from("5"),
        Buffer.from("6789"),
      ]),
      { mimeType: "application/x-test" }
    );

    expect(res.isOk()).toBe(true);
    if (res.isOk() && original.isOk()) {
      // The replacing rename gives the file the upload's new identity.
      expect(res.value.id).not.toBe(original.value.id);
      expect(res.value.size).toBe(10);
    }
    expect(await readText(fs, "data.bin")).toBe("0123456789");
    expect(dfs.paths()).toEqual(["/data.bin"]);
    // One small write, then 3 chunked applies and the replacing rename on its own.
    const uploadCalls = dfs.applyCalls.slice(1);
    expect(uploadCalls.map((ops) => ops.map((op) => op.type))).toEqual([
      ["create", "write"],
      ["write"],
      ["write"],
      ["rename"],
    ]);
  });

  it("removes the temporary upload and keeps the old file when an upload fails", async () => {
    const { dfs, fs } = setup({
      // Fail the second chunk of the upload (apply #2; #0 is the initial small write).
      failApply: (callIndex) =>
        callIndex === 2 ? new DfsError("unavailable") : null,
    });
    await fs.write("data.bin", "old");

    const res = await fs.write("data.bin", "0123456789");

    expect(res.isErr() && res.error.code).toBe("unavailable");
    expect(dfs.paths()).toEqual(["/data.bin"]);
    expect(await readText(fs, "data.bin")).toBe("old");
    expect(dfs.applyCalls.at(-1)?.map((op) => op.type)).toEqual(["remove"]);
  });

  it("leaves the upload in place when the final rename may have committed", async () => {
    const { dfs, fs } = setup({
      // Apply #0 is the initial small write, #1-#3 the chunks, #4 the rename.
      failApply: (callIndex) =>
        callIndex === 4 ? new DfsError("unavailable") : null,
    });
    await fs.write("data.bin", "old");

    const res = await fs.write("data.bin", "0123456789");

    expect(res.isErr() && res.error.code).toBe("unavailable");
    expect(dfs.applyCalls).toHaveLength(5);
    expect(dfs.paths()).toHaveLength(2);
    expect(await readText(fs, "data.bin")).toBe("old");
  });

  it("removes the upload when the final rename is rejected", async () => {
    const { dfs, fs } = setup();

    // The upload's own name is valid; only the final rename to this name fails.
    const res = await fs.write("x".repeat(256), "0123456789");

    expect(res.isErr() && res.error.code).toBe("name_too_long");
    expect(dfs.applyCalls.at(-1)?.map((op) => op.type)).toEqual(["remove"]);
    expect(dfs.paths()).toEqual([]);
  });

  it("removes the upload when the content stream fails", async () => {
    const { dfs, fs } = setup();
    const content = new Readable({ read() {} });
    content.push(Buffer.from("0123456789"));
    setImmediate(() => content.destroy(new Error("socket hang up")));

    const res = await fs.write("data.bin", content);

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    expect(dfs.paths()).toEqual([]);
  });

  it("leaves an existing file untouched when its new MIME type is invalid", async () => {
    const { fs } = setup();
    await fs.write("notes.txt", "abc", { mimeType: "text/plain" });

    const res = await fs.write("notes.txt", "xy", { mimeType: "not a type" });

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    expect(await readText(fs, "notes.txt")).toBe("abc");
  });

  it("streams a file in chunks", async () => {
    const { dfs, fs } = setup();
    await fs.write("f.txt", "abcdefg");

    const stream = await fs.readStream("f.txt");
    expect(stream.isOk()).toBe(true);
    if (!stream.isOk()) {
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream.value) {
      chunks.push(chunk);
    }

    expect(Buffer.concat(chunks).toString()).toBe("abcdefg");
    // 3 + 3 + 1 bytes; the short read ends the stream.
    expect(dfs.readCalls.map((call) => call.offset)).toEqual([0, 3, 6]);
  });

  it("fails a read when the file changes between chunks", async () => {
    let fileId: string | undefined;
    const { dfs, fs } = setup({
      beforeRead: (callIndex) => {
        if (callIndex === 1 && fileId && isDfsObjectId(fileId)) {
          dfs.overwrite(fileId, Buffer.from("ABCDEFG"));
        }
      },
    });
    const written = await fs.write("f.txt", "abcdefg");
    fileId = written.isOk() ? written.value.id : undefined;

    expect(await readText(fs, "f.txt")).toBe("error:content_changed");
  });

  it("removes directories recursively, children first", async () => {
    const { dfs, fs } = setup();
    await fs.write("a/b/one.txt", "1", { createParents: true });
    await fs.write("a/b/c/two.txt", "2", { createParents: true });
    await fs.write("a/three.txt", "3");
    await fs.write("keep.txt", "k");

    const notRecursive = await fs.remove("a");
    expect(notRecursive.isErr() && notRecursive.error.code).toBe("not_empty");

    const res = await fs.remove("a", { recursive: true });

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toEqual(["/keep.txt"]);
    const rootRemoval = await fs.remove("/");
    expect(rootRemoval.isErr() && rootRemoval.error.code).toBe("invalid_input");
  });

  it("copies a file with its MIME type, leaving the source untouched", async () => {
    const { fs } = setup();
    await fs.write("src.md", "hello world", { mimeType: "text/markdown" });

    const res = await fs.copy("src.md", "copies/dest.md", {
      createParents: true,
    });

    expect(res.isOk()).toBe(true);
    expect(await readText(fs, "copies/dest.md")).toBe("hello world");
    expect(await readText(fs, "src.md")).toBe("hello world");
    const stat = await fs.stat("copies/dest.md", { includeMetadata: true });
    expect(stat.isOk() && stat.value?.metadata?.mimeType).toBe("text/markdown");
  });

  it("moves a file keeping its id and refuses to overwrite unless asked", async () => {
    const { fs } = setup();
    const original = await fs.write("a.txt", "a");
    await fs.write("b.txt", "b");
    await fs.mkdir("dir");

    const collision = await fs.move("a.txt", "b.txt");
    expect(collision.isErr() && collision.error.code).toBe("already_exists");

    const moved = await fs.move("a.txt", "dir/renamed.txt");
    expect(moved.isOk() && original.isOk() && moved.value.id).toBe(
      original.isOk() && original.value.id
    );
    expect(await fs.exists("a.txt")).toEqual(
      expect.objectContaining({ value: false })
    );
    expect(await readText(fs, "dir/renamed.txt")).toBe("a");
  });

  it("lists a directory and reports missing or invalid paths", async () => {
    const { fs } = setup();
    await fs.write("dir/b.txt", "b", { createParents: true });
    await fs.write("dir/a.txt", "a");

    const listing = await fs.list("/dir/");
    expect(listing.isOk() && listing.value.map((e) => e.name)).toEqual([
      "a.txt",
      "b.txt",
    ]);

    const dotDot = await fs.stat("dir/../secret");
    expect(dotDot.isErr() && dotDot.error.code).toBe("invalid_input");
    const throughFile = await fs.stat("dir/a.txt/x");
    expect(throughFile.isErr() && throughFile.error.code).toBe("not_directory");
    const missing = await fs.stat("nope.txt");
    expect(missing.isOk() && missing.value).toBe(null);
    const readDir = await fs.readBuffer("dir");
    expect(readDir.isErr() && readDir.error.code).toBe("is_directory");
  });
});
