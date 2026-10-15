// @vitest-environment node
import { DfsFileSystem } from "@app/lib/dfs/file_system";
import { formatDfsUri } from "@app/lib/dfs/uri";
import { InMemoryDfs } from "@app/tests/utils/dfs/InMemoryDfs";
import type { DfsObjectId } from "@app/types/dfs";
import { DfsError } from "@app/types/dfs";
import { Readable } from "stream";
import { describe, expect, it } from "vitest";

const WRITE_CHUNK_BYTES = 4;
const READ_CHUNK_BYTES = 3;

function setup(options: ConstructorParameters<typeof InMemoryDfs>[0] = {}) {
  const dfs = new InMemoryDfs({
    maxWriteBytesPerApply: WRITE_CHUNK_BYTES,
    ...options,
  });
  const fs = new DfsFileSystem(dfs, {
    readChunkBytes: READ_CHUNK_BYTES,
    writeChunkBytes: WRITE_CHUNK_BYTES,
  });
  // A URI anchored at the tenant root, e.g. `at("a/b")` is `dfs://<root-id>/a/b`.
  const at = (path: string) =>
    formatDfsUri(dfs.rootId, { path: path ? path.split("/") : [] });
  return { dfs, fs, at };
}

async function readText(fs: DfsFileSystem, uri: string) {
  const res = await fs.readBuffer(uri);
  return res.isOk() ? res.value.toString() : `error:${res.error.code}`;
}

describe("DfsFileSystem", () => {
  it("returns canonical URIs and resolves paths from any anchor", async () => {
    const { dfs, fs, at } = setup();
    const podId = dfs.createDirectory(
      dfs.createDirectory(dfs.rootId, "pods"),
      "pod-acme"
    );
    const planId = dfs.createFile(
      dfs.createDirectory(podId, "data"),
      "plan.md",
      "plan"
    );

    const fromRoot = await fs.stat(at("pods/pod-acme/data/plan.md"));
    const fromPod = await fs.stat(
      formatDfsUri(podId, { name: "pod-acme", path: ["data", "plan.md"] })
    );
    // The name in the anchor is ignored.
    const byId = await fs.stat(`dfs://old-name.md--${planId}`);

    for (const res of [fromRoot, fromPod, byId]) {
      expect(res.isOk() && res.value?.uri).toBe(`dfs://plan.md--${planId}`);
    }
  });

  it("returns extended metadata on request", async () => {
    const { dfs, fs, at } = setup();
    dfs.createFile(dfs.rootId, "notes.txt", "abc", "text/plain");

    const plain = await fs.stat(at("notes.txt"));
    expect(plain.isOk() && plain.value?.attr.metadata).toBe(undefined);
    const withMetadata = await fs.stat(at("notes.txt"), {
      includeMetadata: true,
    });
    expect(
      withMetadata.isOk() && withMetadata.value?.attr.metadata?.mimeType
    ).toBe("text/plain");
  });

  it("lists a directory and reports missing or invalid URIs", async () => {
    const { dfs, fs, at } = setup();
    const dirId = dfs.createDirectory(dfs.rootId, "dir");
    const bId = dfs.createFile(dirId, "b.txt", "b");
    const aId = dfs.createFile(dirId, "a.txt", "a");

    const listing = await fs.list(at("dir"));
    expect(
      listing.isOk() &&
        listing.value.map((e) => ({ name: e.name, uri: e.object?.uri }))
    ).toEqual([
      { name: "a.txt", uri: `dfs://a.txt--${aId}` },
      { name: "b.txt", uri: `dfs://b.txt--${bId}` },
    ]);
    const listFile = await fs.list(at("dir/a.txt"));
    expect(listFile.isErr() && listFile.error.code).toBe("not_directory");

    expect(await fs.exists(at("dir/a.txt"))).toEqual(
      expect.objectContaining({ value: true })
    );
    const dotDot = await fs.stat(`${at("dir")}/../secret`);
    expect(dotDot.isErr() && dotDot.error.code).toBe("invalid_input");
    const throughFile = await fs.stat(at("dir/a.txt/x"));
    expect(throughFile.isErr() && throughFile.error.code).toBe("not_directory");
    const missing = await fs.stat(at("nope.txt"));
    expect(missing.isOk() && missing.value).toBe(null);
  });

  it("streams a file in chunks", async () => {
    const { dfs, fs, at } = setup();
    dfs.createFile(dfs.rootId, "f.txt", "abcdefg");

    const stream = await fs.readStream(at("f.txt"));
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

  it("keeps reading after reads shorter than requested", async () => {
    const { dfs, fs, at } = setup({ maxReadBytes: 2 });
    dfs.createFile(dfs.rootId, "f.txt", "abcdefg");

    expect(await readText(fs, at("f.txt"))).toBe("abcdefg");
    const stream = await fs.readStream(at("f.txt"));
    expect(stream.isOk()).toBe(true);
    if (!stream.isOk()) {
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream.value) {
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks).toString()).toBe("abcdefg");
    // Both reads stop at the file's size: 2 + 2 + 2 + 1 bytes each.
    expect(dfs.readCalls.map((call) => call.offset)).toEqual([
      0, 2, 4, 6, 0, 2, 4, 6,
    ]);
  });

  it("fails a read on an empty read before the end of the file", async () => {
    const { dfs, fs, at } = setup({ maxReadBytes: 0 });
    dfs.createFile(dfs.rootId, "f.txt", "abc");
    dfs.createFile(dfs.rootId, "empty.txt", "");

    expect(await readText(fs, at("f.txt"))).toBe("error:invalid_response");
    // An empty file needs no read at all.
    expect(await readText(fs, at("empty.txt"))).toBe("");
  });

  it("fails a read when the file changes between chunks", async () => {
    let fileId: DfsObjectId | undefined;
    const { dfs, fs, at } = setup({
      beforeRead: (callIndex) => {
        if (callIndex === 1 && fileId) {
          dfs.overwrite(fileId, Buffer.from("ABCDEFG"));
        }
      },
    });
    fileId = dfs.createFile(dfs.rootId, "f.txt", "abcdefg");

    expect(await readText(fs, at("f.txt"))).toBe("error:content_changed");
  });

  it("refuses to read a directory", async () => {
    const { dfs, fs, at } = setup();
    dfs.createDirectory(dfs.rootId, "dir");

    const res = await fs.readBuffer(at("dir"));

    expect(res.isErr() && res.error.code).toBe("is_directory");
  });

  it("creates missing parent directories one level at a time", async () => {
    const { dfs, fs, at } = setup();

    const dir = await fs.mkdir(at("a/b/c"));
    expect(dir.isOk() && dir.value.attr.kind).toBe("directory");
    const file = await fs.write(at("a/x/z.txt"), "z");
    expect(file.isOk()).toBe(true);

    expect(dfs.paths()).toEqual(["/a", "/a/b", "/a/b/c", "/a/x", "/a/x/z.txt"]);
    expect(dfs.applyCalls.map((ops) => ops.map((op) => op.type))).toEqual([
      ["create"],
      ["create"],
      ["create"],
      // `a` already exists: only `x` and the file are created.
      ["create"],
      ["create"],
      ["write"],
    ]);
    const existing = await fs.mkdir(at("a/b/c"));
    expect(existing.isErr() && existing.error.code).toBe("already_exists");
    const noName = await fs.mkdir(at(""));
    expect(noName.isErr() && noName.error.code).toBe("invalid_input");
    const throughFile = await fs.write(at("a/x/z.txt/w.txt"), "w");
    expect(throughFile.isErr() && throughFile.error.code).toBe("not_directory");
  });

  it("reuses a parent directory created concurrently", async () => {
    const { dfs, fs, at } = setup({
      // Another writer creates `a` right before our own `create` (apply #0).
      beforeApply: (callIndex) => {
        if (callIndex === 0) {
          dfs.createDirectory(dfs.rootId, "a");
        }
      },
    });

    const res = await fs.write(at("a/f.txt"), "f");

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toEqual(["/a", "/a/f.txt"]);
  });

  it("writes and overwrites a small file in place, keeping its id", async () => {
    const { dfs, fs, at } = setup();

    const created = await fs.write(at("notes.txt"), "abc", {
      mimeType: "text/plain",
    });
    expect(await readText(fs, at("notes.txt"))).toBe("abc");
    const overwritten = await fs.write(at("notes.txt"), "xy");

    expect(created.isOk() && overwritten.isOk()).toBe(true);
    if (created.isOk() && overwritten.isOk()) {
      expect(overwritten.value.uri).toBe(created.value.uri);
      expect(overwritten.value.attr.size).toBe(2);
    }
    expect(await readText(fs, at("notes.txt"))).toBe("xy");
    expect(dfs.applyCalls).toHaveLength(3);
    const stat = await fs.stat(at("notes.txt"), { includeMetadata: true });
    expect(stat.isOk() && stat.value?.attr.metadata?.mimeType).toBe(
      "text/plain"
    );
  });

  it("creates an empty file without sending a write", async () => {
    const { dfs, fs, at } = setup();

    const created = await fs.write(at("empty.txt"), "");

    expect(created.isOk() && created.value.attr.size).toBe(0);
    expect(dfs.applyCalls.map((ops) => ops.map((op) => op.type))).toEqual([
      ["create"],
    ]);
    expect(await readText(fs, at("empty.txt"))).toBe("");
  });

  it("keeps a newly created file when its first content write fails", async () => {
    const { dfs, fs, at } = setup({
      failApply: (callIndex) =>
        callIndex === 1 ? new DfsError("unavailable") : null,
    });

    const result = await fs.write(at("notes.txt"), "abc");

    expect(result.isErr() && result.error.code).toBe("unavailable");
    expect(dfs.applyCalls.map((ops) => ops.map((op) => op.type))).toEqual([
      ["create"],
      ["write"],
    ]);
    expect(await readText(fs, at("notes.txt"))).toBe("");
  });

  it("writes large streamed content chunk by chunk, keeping the file's id", async () => {
    const { dfs, fs, at } = setup();
    const original = await fs.write(at("data.bin"), "old");

    const res = await fs.write(
      at("data.bin"),
      Readable.from([
        Buffer.from("01234"),
        Buffer.from("5"),
        Buffer.from("6789"),
      ]),
      { mimeType: "application/x-test" }
    );

    expect(res.isOk()).toBe(true);
    if (res.isOk() && original.isOk()) {
      expect(res.value.uri).toBe(original.value.uri);
      expect(res.value.attr.size).toBe(10);
    }
    expect(await readText(fs, at("data.bin"))).toBe("0123456789");
    // The MIME type on its own, then the truncation with the first chunk, then one apply per chunk.
    const writeCalls = dfs.applyCalls.slice(2);
    expect(writeCalls.map((ops) => ops.map((op) => op.type))).toEqual([
      ["update"],
      ["update", "write"],
      ["write"],
      ["write"],
    ]);
    const stat = await fs.stat(at("data.bin"), { includeMetadata: true });
    expect(stat.isOk() && stat.value?.attr.metadata?.mimeType).toBe(
      "application/x-test"
    );
  });

  it("writes large content through a URI without a path", async () => {
    const { fs, at } = setup();
    const original = await fs.write(at("data.bin"), "old");
    expect(original.isOk()).toBe(true);
    if (!original.isOk()) {
      return;
    }

    const res = await fs.write(original.value.uri, "0123456789");

    expect(res.isOk() && res.value.uri).toBe(original.value.uri);
    expect(await readText(fs, at("data.bin"))).toBe("0123456789");
  });

  it("leaves the content written so far when a chunk fails", async () => {
    const { fs, at } = setup({
      // Apply #0 creates the file, #1 writes it, #2 replaces the first chunk, #3 the second one.
      failApply: (callIndex) =>
        callIndex === 3 ? new DfsError("unavailable") : null,
    });
    await fs.write(at("data.bin"), "old");

    const res = await fs.write(at("data.bin"), "0123456789");

    expect(res.isErr() && res.error.code).toBe("unavailable");
    expect(await readText(fs, at("data.bin"))).toBe("0123");
  });

  it("fails the write when the content stream fails", async () => {
    const { dfs, fs, at } = setup();
    const content = new Readable({ read() {} });
    content.push(Buffer.from("0123456789"));
    setImmediate(() => content.destroy(new Error("socket hang up")));

    const res = await fs.write(at("data.bin"), content);

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    // The two full chunks were written before the stream failed.
    expect(dfs.paths()).toEqual(["/data.bin"]);
    expect(await readText(fs, at("data.bin"))).toBe("01234567");
  });

  it("fails the write when the content stream fails before it is read", async () => {
    // Lookups wait for the event loop, like real network calls, so the stream's error is emitted
    // while the write is still resolving its target.
    class SlowInMemoryDfs extends InMemoryDfs {
      override async lookup(args: Parameters<InMemoryDfs["lookup"]>[0]) {
        await new Promise((resolve) => setImmediate(resolve));
        return super.lookup(args);
      }
    }
    const dfs = new SlowInMemoryDfs({
      maxWriteBytesPerApply: WRITE_CHUNK_BYTES,
    });
    const fs = new DfsFileSystem(dfs, { writeChunkBytes: WRITE_CHUNK_BYTES });
    const at = (path: string) =>
      formatDfsUri(dfs.rootId, { path: path.split("/") });
    const content = new Readable({ read() {} });
    content.destroy(new Error("socket hang up"));

    const res = await fs.write(at("dir/data.bin"), content);

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    expect(dfs.paths()).toEqual(["/dir"]);
  });

  it("leaves an existing file untouched when its new MIME type is invalid", async () => {
    const { fs, at } = setup();
    await fs.write(at("notes.txt"), "abc", { mimeType: "text/plain" });

    const res = await fs.write(at("notes.txt"), "xy", {
      mimeType: "not a type",
    });

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    expect(await readText(fs, at("notes.txt"))).toBe("abc");
    const stat = await fs.stat(at("notes.txt"), { includeMetadata: true });
    expect(stat.isOk() && stat.value?.attr.metadata?.mimeType).toBe(
      "text/plain"
    );
  });

  it("returns canonical URIs that keep targeting the object after a move", async () => {
    const { fs, at } = setup();

    const created = await fs.write(at("drafts/plan.md"), "v1");
    expect(created.isOk()).toBe(true);
    if (!created.isOk()) {
      return;
    }
    const { uri, attr } = created.value;
    expect(uri).toBe(`dfs://plan.md--${attr.id}`);

    await fs.mkdir(at("final"));
    await fs.move(uri, at("final/renamed.md"));

    // The stale name in the stored URI is ignored.
    expect(await readText(fs, uri)).toBe("v1");
    const overwritten = await fs.write(uri, "v2");
    expect(overwritten.isOk() && overwritten.value.uri).toBe(
      `dfs://renamed.md--${attr.id}`
    );
    expect(await readText(fs, at("final/renamed.md"))).toBe("v2");
  });

  it("removes directories recursively, children first", async () => {
    const { dfs, fs, at } = setup();
    await fs.write(at("a/b/one.txt"), "1");
    await fs.write(at("a/b/c/two.txt"), "2");
    await fs.write(at("a/three.txt"), "3");
    await fs.write(at("keep.txt"), "k");

    const notRecursive = await fs.remove(at("a"));
    expect(notRecursive.isErr() && notRecursive.error.code).toBe("not_empty");

    const res = await fs.remove(at("a"), { recursive: true });

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toEqual(["/keep.txt"]);
  });

  it("removes the anchor itself through a URI without a path", async () => {
    const { dfs, fs, at } = setup();
    const file = await fs.write(at("tmp.txt"), "t");
    expect(file.isOk()).toBe(true);
    if (!file.isOk()) {
      return;
    }

    const res = await fs.remove(file.value.uri);

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toEqual([]);
  });

  it("copies a file with its MIME type, leaving the source untouched", async () => {
    const { fs, at } = setup();
    await fs.write(at("src.md"), "hello world", { mimeType: "text/markdown" });

    const res = await fs.copy(at("src.md"), at("copies/dest.md"));

    expect(res.isOk()).toBe(true);
    expect(await readText(fs, at("copies/dest.md"))).toBe("hello world");
    expect(await readText(fs, at("src.md"))).toBe("hello world");
    const stat = await fs.stat(at("copies/dest.md"), { includeMetadata: true });
    expect(stat.isOk() && stat.value?.attr.metadata?.mimeType).toBe(
      "text/markdown"
    );
  });

  it("refuses to copy a file onto itself, even through another URI", async () => {
    const { fs, at } = setup();
    // More than one write chunk, so a self-copy would truncate it while reading it.
    const file = await fs.write(at("data.bin"), "0123456789");
    expect(file.isOk()).toBe(true);
    if (!file.isOk()) {
      return;
    }

    const byPath = await fs.copy(at("data.bin"), at("data.bin"));
    const byId = await fs.copy(at("data.bin"), file.value.uri);

    expect(byPath.isErr() && byPath.error.code).toBe("invalid_input");
    expect(byId.isErr() && byId.error.code).toBe("invalid_input");
    expect(await readText(fs, at("data.bin"))).toBe("0123456789");
  });

  it("rejects an invalid destination before resolving the source", async () => {
    const { fs, at } = setup();

    const res = await fs.copy(at("missing.txt"), "not-a-dfs-uri");

    expect(res.isErr() && res.error.code).toBe("invalid_input");
  });

  it("copies a file without MIME type, clearing the destination's", async () => {
    const { fs, at } = setup();
    await fs.write(at("src.bin"), "src", { mimeType: "" });
    await fs.write(at("existing.bin"), "old", { mimeType: "text/plain" });

    await fs.copy(at("src.bin"), at("new.bin"));
    await fs.copy(at("src.bin"), at("existing.bin"));

    for (const name of ["new.bin", "existing.bin"]) {
      const stat = await fs.stat(at(name), { includeMetadata: true });
      expect(stat.isOk() && stat.value?.attr.metadata?.mimeType).toBe(
        undefined
      );
      expect(await readText(fs, at(name))).toBe("src");
    }
  });

  it("moves a file keeping its id and refuses to overwrite unless asked", async () => {
    const { fs, at } = setup();
    const original = await fs.write(at("a.txt"), "a");
    await fs.write(at("b.txt"), "b");
    await fs.mkdir(at("dir"));

    const collision = await fs.move(at("a.txt"), at("b.txt"));
    expect(collision.isErr() && collision.error.code).toBe("already_exists");
    const missingParent = await fs.move(at("a.txt"), at("nope/a.txt"));
    expect(missingParent.isErr() && missingParent.error.code).toBe("not_found");

    const moved = await fs.move(at("a.txt"), at("dir/renamed.txt"));
    expect(moved.isOk() && original.isOk() && moved.value.attr.id).toBe(
      original.isOk() && original.value.attr.id
    );
    expect(await fs.exists(at("a.txt"))).toEqual(
      expect.objectContaining({ value: false })
    );
    expect(await readText(fs, at("dir/renamed.txt"))).toBe("a");

    const replaced = await fs.move(at("b.txt"), at("dir/renamed.txt"), {
      replace: true,
    });
    expect(replaced.isOk()).toBe(true);
    expect(await readText(fs, at("dir/renamed.txt"))).toBe("b");
  });
});
