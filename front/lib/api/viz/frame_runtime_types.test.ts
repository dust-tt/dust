// @vitest-environment node

import { createHash } from "node:crypto";

import config from "@app/lib/api/config";
import {
  getFrameRuntimeTypesArtifact,
  resetFrameRuntimeTypesArtifactCacheForTests,
} from "@app/lib/api/viz/frame_runtime_types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<typeof fetch>();

const tarball = Buffer.from("tarball-bytes");
const manifest = {
  version: 1,
  id: "a".repeat(64),
  path: `/frame-runtime/${"a".repeat(64)}.tgz`,
  tarballSha256: createHash("sha256").update(tarball).digest("hex"),
  sizeBytes: tarball.byteLength,
};

function respondWith(manifestBody: unknown, tarballBody: Buffer = tarball) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/frame-runtime/manifest.json")) {
      return new Response(JSON.stringify(manifestBody), { status: 200 });
    }
    if (url.endsWith(manifest.path)) {
      return new Response(new Uint8Array(tarballBody), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
}

beforeEach(() => {
  resetFrameRuntimeTypesArtifactCacheForTests();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(config, "getVizPublicUrl").mockReturnValue("https://viz.test/");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("getFrameRuntimeTypesArtifact", () => {
  it("fetches the manifest and verified tarball, then reuses them", async () => {
    respondWith(manifest);

    const first = await getFrameRuntimeTypesArtifact();
    const second = await getFrameRuntimeTypesArtifact();

    expect(first).toEqual({
      id: manifest.id,
      tarball,
      tarballSha256: manifest.tarballSha256,
    });
    expect(second).toBe(first);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "https://viz.test/frame-runtime/manifest.json",
      `https://viz.test${manifest.path}`,
    ]);
  });

  it("re-checks the manifest after the interval without re-downloading an unchanged tarball", async () => {
    respondWith(manifest);
    const first = await getFrameRuntimeTypesArtifact();
    vi.advanceTimersByTime(61_000);

    const second = await getFrameRuntimeTypesArtifact();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns null when Viz has no artifact and nothing is cached", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    expect(await getFrameRuntimeTypesArtifact()).toBeNull();
  });

  it("keeps the cached artifact when a refresh fails", async () => {
    respondWith(manifest);
    const first = await getFrameRuntimeTypesArtifact();
    vi.advanceTimersByTime(61_000);
    fetchMock.mockRejectedValue(new Error("connection refused"));

    expect(await getFrameRuntimeTypesArtifact()).toBe(first);
  });

  it("rejects a tarball that does not match its manifest", async () => {
    respondWith(manifest, Buffer.from("tampered"));

    expect(await getFrameRuntimeTypesArtifact()).toBeNull();
  });

  it("rejects an invalid manifest", async () => {
    respondWith({ ...manifest, path: "/etc/passwd" });

    expect(await getFrameRuntimeTypesArtifact()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
