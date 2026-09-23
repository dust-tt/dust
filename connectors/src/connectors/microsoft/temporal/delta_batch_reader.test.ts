import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import {
  DELTA_READ_HEARTBEAT_INTERVAL_MS,
  readDeltaBatchFromGCSStream,
} from "@connectors/connectors/microsoft/temporal/delta_batch_reader";
import { CancelledFailure } from "@temporalio/common";
import { Readable } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const DELTA_LINK =
  "https://graph.microsoft.com/v1.0/drives/d/root/delta?token=x";
const ROOT_NODE_IDS = ["microsoft-folder-a", "microsoft-folder-b"];

function makeItem(index: number): DriveItem {
  return {
    id: `item-${index}`,
    name: `file-${index}.txt`,
    "@microsoft.graph.downloadUrl": undefined,
  };
}

// Streams a delta file chunk by chunk, generating each item on demand so the
// test never materializes the array either (same layout as createDeltaJsonStream).
function makeDeltaFile({
  totalItems,
  header,
  onItem,
}: {
  totalItems: number;
  header?: string;
  onItem?: (index: number) => void;
}) {
  let index = 0;
  let sentHeader = false;
  let sentFooter = false;
  const stream = new Readable({
    read() {
      if (!sentHeader) {
        this.push(
          header ??
            `{"deltaLink":${JSON.stringify(DELTA_LINK)}` +
              `,"rootNodeIds":${JSON.stringify(ROOT_NODE_IDS)}` +
              `,"totalItems":${totalItems},"sortedChangedItems":[`
        );
        sentHeader = true;
        return;
      }
      if (index < totalItems) {
        onItem?.(index);
        this.push((index > 0 ? "," : "") + JSON.stringify(makeItem(index)));
        index++;
        return;
      }
      if (!sentFooter) {
        this.push("]}");
        sentFooter = true;
        return;
      }
      this.push(null);
    },
  });
  return {
    stream,
    file: { createReadStream: () => stream },
    itemsProduced: () => index,
  };
}

const noopHeartbeat = async () => {};

afterEach(() => {
  vi.useRealTimers();
});

describe("readDeltaBatchFromGCSStream", () => {
  it("returns the requested window and the file metadata", async () => {
    const { file } = makeDeltaFile({ totalItems: 10 });

    const res = await readDeltaBatchFromGCSStream(file, 3, 4, noopHeartbeat);

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }
    expect(res.value.deltaLink).toBe(DELTA_LINK);
    expect(res.value.rootNodeIds).toEqual(ROOT_NODE_IDS);
    expect(res.value.totalItems).toBe(10);
    expect(res.value.batch.map((item) => item.id)).toEqual([
      "item-3",
      "item-4",
      "item-5",
      "item-6",
    ]);
  });

  it("covers the array exactly once across successive windows", async () => {
    const totalItems = 10;
    const batchSize = 4;
    const seen: (string | undefined)[] = [];

    for (const cursor of [0, 4, 8]) {
      const { file } = makeDeltaFile({ totalItems });
      const res = await readDeltaBatchFromGCSStream(
        file,
        cursor,
        batchSize,
        noopHeartbeat
      );
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.batch.length).toBe(Math.min(batchSize, 10 - cursor));
        seen.push(...res.value.batch.map((item) => item.id));
      }
    }
    expect(seen).toEqual(
      Array.from({ length: totalItems }, (_, i) => `item-${i}`)
    );
  });

  it("returns an empty batch with metadata for a window past the end", async () => {
    const { file } = makeDeltaFile({ totalItems: 10 });

    const res = await readDeltaBatchFromGCSStream(file, 12, 4, noopHeartbeat);

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.batch).toEqual([]);
      expect(res.value.totalItems).toBe(10);
    }
  });

  it("rejects a file with malformed metadata", async () => {
    const { file } = makeDeltaFile({
      totalItems: 2,
      header: `{"deltaLink":"x","rootNodeIds":[],"sortedChangedItems":[`,
    });

    const res = await readDeltaBatchFromGCSStream(file, 0, 10, noopHeartbeat);

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toMatch(/metadata/);
    }
  });

  it("heartbeats before reading and keeps heartbeating during a slow read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    const totalItems = 20_000;
    // Each item takes one fake second to arrive: the whole read outlasts the
    // heartbeat interval many times over. Large enough (~800KB) that the source
    // cannot fit in the stream buffers and run ahead of the consumer.
    const delta = makeDeltaFile({
      totalItems,
      onItem: (index) => vi.setSystemTime(start + index * 1_000),
    });
    const heartbeats: { at: number; itemsProduced: number }[] = [];
    const heartbeat = async () => {
      heartbeats.push({ at: Date.now(), itemsProduced: delta.itemsProduced() });
    };

    const res = await readDeltaBatchFromGCSStream(delta.file, 0, 5, heartbeat);

    expect(res.isOk()).toBe(true);
    // Once before anything was consumed.
    expect(heartbeats[0]).toEqual({ at: start, itemsProduced: 0 });
    // Then while the array was still streaming in, not just at the end.
    const midRead = heartbeats.filter(
      (h) => h.itemsProduced > 0 && h.itemsProduced < totalItems
    );
    expect(midRead.length).toBeGreaterThanOrEqual(2);
    // Throttled to the interval, never per item.
    let previousAt = start;
    for (const h of heartbeats.slice(1)) {
      expect(h.at - previousAt).toBeGreaterThanOrEqual(
        DELTA_READ_HEARTBEAT_INTERVAL_MS
      );
      previousAt = h.at;
    }
    // Progress-driven: heartbeats keep pace with the source until its last item.
    expect(start + (totalItems - 1) * 1_000 - previousAt).toBeLessThan(
      DELTA_READ_HEARTBEAT_INTERVAL_MS + 1_000
    );
  });

  it("stops reading and destroys the stream when the heartbeat rejects", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    const totalItems = 20_000;
    const delta = makeDeltaFile({
      totalItems,
      onItem: (index) => vi.setSystemTime(start + index * 1_000),
    });
    const cancellation = new CancelledFailure("TIMED_OUT");
    let calls = 0;
    const heartbeat = async () => {
      calls++;
      if (calls === 2) {
        throw cancellation;
      }
    };

    const res = await readDeltaBatchFromGCSStream(delta.file, 0, 5, heartbeat);

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      // Same instance, so the activity boundary rethrows the cancellation as is.
      expect(res.error).toBe(cancellation);
    }
    expect(calls).toBe(2);
    expect(delta.stream.destroyed).toBe(true);
    // The download stopped where the read was abandoned, not at the end.
    const producedAtReturn = delta.itemsProduced();
    expect(producedAtReturn).toBeLessThan(totalItems);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(delta.itemsProduced()).toBe(producedAtReturn);
  });

  it("propagates a source stream error and tears down", async () => {
    const sourceError = new Error("gcs read failed");
    const stream = new Readable({
      read() {
        this.push(`{"deltaLink":"x","rootNodeIds":[],"totalItems":1,`);
        this.destroy(sourceError);
      },
    });

    const res = await readDeltaBatchFromGCSStream(
      { createReadStream: () => stream },
      0,
      10,
      noopHeartbeat
    );

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error).toBe(sourceError);
    }
    expect(stream.destroyed).toBe(true);
  });

  it("propagates a parser error on invalid JSON and tears down", async () => {
    const stream = Readable.from([
      `{"deltaLink":"x","sortedChangedItems":[{"id":`,
      `oops]}`,
    ]);

    const res = await readDeltaBatchFromGCSStream(
      { createReadStream: () => stream },
      0,
      10,
      noopHeartbeat
    );

    expect(res.isErr()).toBe(true);
    expect(stream.destroyed).toBe(true);
  });
});
