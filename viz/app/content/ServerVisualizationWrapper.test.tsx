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

function trackedChunkedBody(
  bytes: number,
  tracker: { liveBytes: number; peakLiveBytes: number }
): ReadableStream<Uint8Array> {
  let pulledBytes = 0;
  return new ReadableStream({
    pull(controller) {
      if (pulledBytes === bytes) {
        controller.close();
        return;
      }
      const chunkBytes = Math.min(MB, bytes - pulledBytes);
      pulledBytes += chunkBytes;
      tracker.liveBytes += chunkBytes;
      tracker.peakLiveBytes = Math.max(
        tracker.peakLiveBytes,
        tracker.liveBytes
      );
      controller.enqueue(new Uint8Array(chunkBytes));
    },
    cancel() {
      tracker.liveBytes -= pulledBytes;
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

  it("aborts reads that would exceed the total budget and keeps only files that fit", async () => {
    const fileIds = ["fil_1", "fil_2", "fil_3", "fil_4"];
    mocks.extractFileRefs.mockReturnValue(
      fileIds.map((fileId): FileRef => ({ type: "fileId", fileId }))
    );
    const tracker = { liveBytes: 0, peakLiveBytes: 0 };
    stubFetch(
      Object.fromEntries(
        fileIds.map((fileId) => [
          fileId,
          () => new Response(trackedChunkedBody(19 * MB, tracker)),
        ])
      )
    );

    const files = await renderPrefetchedFiles();

    expect(files).toHaveLength(2);
    // Allows one read-ahead chunk per concurrent stream plus the chunk that crosses the budget.
    expect(tracker.peakLiveBytes).toBeLessThanOrEqual(55 * MB);
  });
});
