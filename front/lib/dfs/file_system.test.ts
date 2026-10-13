// @vitest-environment node
import { DfsFileSystem } from "@app/lib/dfs/file_system";
import { formatDfsUri } from "@app/lib/dfs/uri";
import { InMemoryDfs } from "@app/tests/utils/dfs/InMemoryDfs";
import type { DfsObjectId } from "@app/types/dfs";
import { describe, expect, it } from "vitest";

const READ_CHUNK_BYTES = 3;

function setup(options: ConstructorParameters<typeof InMemoryDfs>[0] = {}) {
  const dfs = new InMemoryDfs(options);
  const fs = new DfsFileSystem(dfs, { readChunkBytes: READ_CHUNK_BYTES });
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
});
