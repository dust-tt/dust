import { describe, expect, it, vi } from "vitest";

const { mockDownload } = vi.hoisted(() => ({
  mockDownload: vi.fn(),
}));

vi.mock("@app/lib/file_storage", () => ({
  getUpsertQueueBucket: () => ({
    file: () => ({ download: mockDownload }),
  }),
}));

import { fetchUpsertQueuePayload } from "@app/lib/upsert_queue";

describe("fetchUpsertQueuePayload", () => {
  it("returns the downloaded buffer", async () => {
    const payload = Buffer.from('{"documentId":"doc"}');
    mockDownload.mockResolvedValueOnce([payload]);

    await expect(fetchUpsertQueuePayload("queue-id")).resolves.toBe(payload);
  });

  it("returns null when the payload no longer exists in GCS", async () => {
    mockDownload.mockRejectedValueOnce({ code: 404 });

    await expect(fetchUpsertQueuePayload("queue-id")).resolves.toBeNull();
  });

  it("rethrows other download errors", async () => {
    const error = { code: 500 };
    mockDownload.mockRejectedValueOnce(error);

    await expect(fetchUpsertQueuePayload("queue-id")).rejects.toBe(error);
  });
});
