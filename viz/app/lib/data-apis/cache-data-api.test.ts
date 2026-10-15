import { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import { afterEach, describe, expect, it, vi } from "vitest";

const FRAME_MIME_TYPE = "application/vnd.dust.frame";

function stubSharedFiles(
  files: Record<string, { content: string; contentType: string }>
) {
  const fetchSharedFile = vi.fn(async (url: string) => {
    const fileRef =
      new URL(url, "http://viz").searchParams.get("fileRef") ?? "";
    const file = files[fileRef];
    return file
      ? new Response(file.content, {
          headers: { "content-type": file.contentType },
        })
      : new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchSharedFile);
  return fetchSharedFile;
}

function requestedFileRefs(
  fetchSharedFile: ReturnType<typeof stubSharedFiles>
) {
  return fetchSharedFile.mock.calls.map(([url]) =>
    new URL(url, "http://viz").searchParams.get("fileRef")
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CacheDataAPI shared file downloads", () => {
  it("prefetches refs of nested frames once each, including import cycles", async () => {
    const fetchSharedFile = stubSharedFiles({
      fil_parent0001: {
        content: 'import Child from "fil_child00001"; useFile("./data.csv");',
        contentType: FRAME_MIME_TYPE,
      },
      fil_child00001: {
        content: 'import Parent from "fil_parent0001";',
        contentType: FRAME_MIME_TYPE,
      },
      "./data.csv": { content: "a,b", contentType: "text/csv" },
    });
    const api = new CacheDataAPI({
      code: 'import Parent from "fil_parent0001";',
      accessToken: "token",
    });

    await api.prefetchReferencedFiles();
    const data = await api.fetchFile("./data.csv");

    expect(requestedFileRefs(fetchSharedFile).sort()).toEqual([
      "./data.csv",
      "fil_child00001",
      "fil_parent0001",
    ]);
    expect(await data?.file.text()).toBe("a,b");
    expect(data).toMatchObject({ revision: null, canWrite: false });
  });

  it("returns null for unavailable files and without an access token", async () => {
    const fetchSharedFile = stubSharedFiles({});

    await expect(
      new CacheDataAPI({ accessToken: "token" }).fetchFile("fil_missing001")
    ).resolves.toBeNull();
    await expect(
      new CacheDataAPI().fetchFile("fil_missing001")
    ).resolves.toBeNull();
    expect(fetchSharedFile).toHaveBeenCalledOnce();
  });
});
