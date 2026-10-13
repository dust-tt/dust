// @vitest-environment node
import { DfsFileSystem } from "@app/lib/dfs/file_system";
import { formatDfsUri } from "@app/lib/dfs/uri";
import { InMemoryDfs } from "@app/tests/utils/dfs/InMemoryDfs";
import { describe, expect, it } from "vitest";

function setup() {
  const dfs = new InMemoryDfs();
  const fs = new DfsFileSystem(dfs);
  // A URI anchored at the tenant root, e.g. `at("a/b")` is `dfs://<root-id>/a/b`.
  const at = (path: string) =>
    formatDfsUri(dfs.rootId, { path: path ? path.split("/") : [] });
  return { dfs, fs, at };
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
});
