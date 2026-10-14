import type { PreFetchedFile } from "@viz/app/lib/data-apis/cache-data-api";
import { getVizCatalog } from "@viz/app/lib/i18n/catalogs";
import type { FileRef } from "@viz/app/lib/parseFileRefs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerSideVisualizationWrapper } from "./ServerVisualizationWrapper";

const mocks = vi.hoisted(() => ({
  extractFileRefs: vi.fn<(text: string) => FileRef[]>(),
}));

vi.mock("@viz/app/lib/parseFileRefs", () => ({
  extractFileRefs: mocks.extractFileRefs,
}));

vi.mock("@viz/app/content/ServerVisualizationWrapperClient", () => ({
  ServerVisualizationWrapperClient: () => null,
}));

const MB = 1024 * 1024;

function streamedBody(bytes: number): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

function stubFetch(files: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/v1/viz/content")) {
        return Response.json({ content: "frame code" });
      }
      const fileId = url.split("/").pop() ?? "";
      return files[fileId]?.() ?? new Response(null, { status: 404 });
    })
  );
}

async function renderPrefetchedFiles(): Promise<PreFetchedFile[]> {
  const element = await ServerSideVisualizationWrapper({
    accessToken: "token",
    allowedOrigins: [],
    identifier: "viz-1",
    catalog: getVizCatalog("en-US"),
  });
  return element?.props.prefetchedFiles ?? [];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("ServerSideVisualizationWrapper prefetch budget", () => {
  it("skips a file whose declared size exceeds the per-file limit", async () => {
    mocks.extractFileRefs.mockReturnValue([
      { type: "fileId", fileId: "fil_small" },
      { type: "fileId", fileId: "fil_large" },
    ]);
    stubFetch({
      fil_small: () => new Response(new Uint8Array(1024)),
      fil_large: () =>
        new Response(streamedBody(1024), {
          headers: { "content-length": String(21 * MB) },
        }),
    });

    const files = await renderPrefetchedFiles();

    expect(files.map((f) => f.fileId)).toEqual(["fil_small"]);
  });

  it("skips a streamed file without content-length once it exceeds the per-file limit", async () => {
    mocks.extractFileRefs.mockReturnValue([
      { type: "fileId", fileId: "fil_streamed" },
    ]);
    stubFetch({
      fil_streamed: () => new Response(streamedBody(21 * MB)),
    });

    const files = await renderPrefetchedFiles();

    expect(files).toEqual([]);
  });

  it("stops prefetching once the total budget is spent", async () => {
    mocks.extractFileRefs.mockReturnValue([
      { type: "fileId", fileId: "fil_1" },
      { type: "fileId", fileId: "fil_2" },
      { type: "fileId", fileId: "fil_3" },
    ]);
    stubFetch({
      fil_1: () => new Response(streamedBody(19 * MB)),
      fil_2: () => new Response(streamedBody(19 * MB)),
      fil_3: () => new Response(streamedBody(19 * MB)),
    });

    const files = await renderPrefetchedFiles();

    expect(files).toHaveLength(2);
  });
});
