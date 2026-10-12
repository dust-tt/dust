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
      ["create", "write"],
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
    const overwritten = await fs.write(at("notes.txt"), "xy");

    expect(created.isOk() && overwritten.isOk()).toBe(true);
    if (created.isOk() && overwritten.isOk()) {
      expect(overwritten.value.uri).toBe(created.value.uri);
      expect(overwritten.value.attr.size).toBe(2);
    }
    expect(await readText(fs, at("notes.txt"))).toBe("xy");
    expect(dfs.applyCalls).toHaveLength(2);
    const stat = await fs.stat(at("notes.txt"), { includeMetadata: true });
    expect(stat.isOk() && stat.value?.attr.metadata?.mimeType).toBe(
      "text/plain"
    );
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
    const writeCalls = dfs.applyCalls.slice(1);
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
      // Apply #0 is the initial small write, #1 the first chunk, #2 the second one.
      failApply: (callIndex) =>
        callIndex === 2 ? new DfsError("unavailable") : null,
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

  it("leaves an existing file untouched when its new MIME type is invalid", async () => {
    const { fs, at } = setup();
    await fs.write(at("notes.txt"), "abc", { mimeType: "text/plain" });

    const res = await fs.write(at("notes.txt"), "xy", {
      mimeType: "not a type",
    });

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    expect(await readText(fs, at("notes.txt"))).toBe("abc");
  });
});
