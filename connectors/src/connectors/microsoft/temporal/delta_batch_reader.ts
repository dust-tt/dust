import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import { normalizeError } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Bucket } from "@google-cloud/storage";
import { parser } from "stream-json";
import Assembler from "stream-json/Assembler";
import Ignore from "stream-json/filters/Ignore";
import Pick from "stream-json/filters/Pick";
import StreamArray from "stream-json/streamers/StreamArray";

// Shape of the delta file written by fetchDeltaForRootNodesInDrive.
interface DeltaDataInGCS {
  deltaLink: string;
  rootNodeIds: string[];
  sortedChangedItems: DriveItem[];
  totalItems: number;
}

// Only the read-stream factory of a GCS File is needed (and faked in tests).
type DeltaFile = {
  createReadStream: ReturnType<Bucket["file"]>["createReadStream"];
};

interface DeltaBatchFromGCS {
  deltaLink: string;
  rootNodeIds: string[];
  totalItems: number;
  batch: DriveItem[];
}

// The read heartbeats at most this often while items keep arriving. Well under
// the 5 minute heartbeatTimeout of processDeltaChangesFromGCS.
export const DELTA_READ_HEARTBEAT_INTERVAL_MS = 30_000;

// Runtime validation of the delta file's metadata (every field but the
// changed-items array). The cursor logic trusts `totalItems`, so the parsed JSON
// must be validated with a type guard rather than cast (no-unsafe-type-assertions).
function isDeltaMetadata(
  value: unknown
): value is Omit<DeltaDataInGCS, "sortedChangedItems"> {
  return (
    typeof value === "object" &&
    value !== null &&
    "deltaLink" in value &&
    typeof value.deltaLink === "string" &&
    "totalItems" in value &&
    typeof value.totalItems === "number" &&
    "rootNodeIds" in value &&
    Array.isArray(value.rootNodeIds) &&
    value.rootNodeIds.every((id) => typeof id === "string")
  );
}

// Reads only the [startIndex, startIndex + batchSize) window of
// `sortedChangedItems` from a GCS delta file, plus the (small) metadata fields.
//
// The changed-items array can hold hundreds of thousands of DriveItems;
// materializing it whole (as a previous implementation did, times the concurrent
// delta activities) OOMs the worker. Here two branches read off a single token
// stream: one strips the array and assembles only the metadata, the other
// streams the array element by element and keeps just the requested window, so
// peak memory is bounded to `batchSize` items regardless of delta size.
//
// `sortedChangedItems` is written pre-sorted, so windowing by array index is
// stable across successive batches of the same file.
//
// The whole array is still parsed on every call (the metadata and the array
// share one token stream), so one call can take longer than the activity's
// heartbeatTimeout on a large delta: the read heartbeats as it goes.
/**
 * @cc [owner:tdraier,label:performance] delta-read-heartbeats
 * The read MUST call `heartbeat` before consuming the file and then at least
 * once per `DELTA_READ_HEARTBEAT_INTERVAL_MS` of wall-clock time while array
 * items keep arriving, so a read that outlasts the activity's heartbeatTimeout
 * is not timed out while it is making progress. A stalled source MUST NOT be
 * kept alive by heartbeats. When `heartbeat` rejects, the read MUST stop and
 * destroy its streams, and the rejection MUST be returned as the `Err` value
 * unchanged so the activity boundary rethrows Temporal's cancellation as is.
 */
export async function readDeltaBatchFromGCSStream(
  file: DeltaFile,
  startIndex: number,
  batchSize: number,
  heartbeat: () => Promise<void>
): Promise<Result<DeltaBatchFromGCS, Error>> {
  const readStream = file.createReadStream();
  const jsonParser = parser();

  // Branch 1: everything except the big array -> assembled metadata.
  const ignore = new Ignore({ filter: "sortedChangedItems" });
  const metaAssembler = Assembler.connectTo(ignore);

  // Branch 2: the array, streamed element by element; keep only the window.
  const pick = new Pick({ filter: "sortedChangedItems" });
  const streamArray = new StreamArray();
  const endIndex = startIndex + batchSize;
  const batch: DriveItem[] = [];

  try {
    await heartbeat();
    let lastHeartbeatAt = Date.now();

    const metaDone = new Promise<unknown>((resolve, reject) => {
      metaAssembler.on("done", (asm: Assembler) => resolve(asm.current));
      ignore.on("error", reject);
    });

    // Async iteration (rather than a "data" listener) so the heartbeat can be
    // awaited inline: the array stream is not read while a heartbeat is in
    // flight, which keeps backpressure on the GCS stream and lets the
    // heartbeat's rejection (activity cancelled or timed out) abort the read.
    const itemsDone = (async () => {
      for await (const chunk of streamArray) {
        const { key, value }: { key: number; value: DriveItem } = chunk;
        if (key >= startIndex && key < endIndex) {
          batch.push(value);
        }
        if (Date.now() - lastHeartbeatAt >= DELTA_READ_HEARTBEAT_INTERVAL_MS) {
          await heartbeat();
          lastHeartbeatAt = Date.now();
        }
      }
    })();

    // Reject if the source or parser fails; never resolves on its own.
    const sourceError = new Promise<never>((_resolve, reject) => {
      readStream.on("error", reject);
      jsonParser.on("error", reject);
      pick.on("error", reject);
    });

    readStream.pipe(jsonParser);
    jsonParser.pipe(ignore);
    jsonParser.pipe(pick).pipe(streamArray);

    const meta = await Promise.race([
      Promise.all([metaDone, itemsDone]).then(([m]) => m),
      sourceError,
    ]);

    if (!isDeltaMetadata(meta)) {
      return new Err(new Error("Delta file metadata is missing or malformed."));
    }

    return new Ok({
      deltaLink: meta.deltaLink,
      rootNodeIds: meta.rootNodeIds,
      totalItems: meta.totalItems,
      batch,
    });
  } catch (error) {
    // The failures here come from the GCS read stream and the stream-json
    // parser (external libraries), or from `heartbeat` (Temporal SDK). Return
    // them as an Err so the activity entrypoint reports the failure at the
    // boundary, per the temporal-activity-failure-boundary contract.
    // normalizeError returns Error instances as is, so a CancelledFailure
    // reaches the boundary unchanged.
    return new Err(normalizeError(error));
  } finally {
    // Tear everything down so the underlying TLS socket is released back to the
    // agent pool, mirroring the previous `pipeline()`-based cleanup.
    readStream.destroy();
    jsonParser.destroy();
    ignore.destroy();
    pick.destroy();
    streamArray.destroy();
  }
}
