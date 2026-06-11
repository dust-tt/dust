// RPC wire protocol between the client and the engine worker. Plain
// structured-clone messages; ArrayBuffers travel as transferables.

import type { DisplayMode, EngineError, OpenOptions, Progress, SearchOpts } from "./types";

export type EngineRequest = { id: number } & (
  | {
      op: "open";
      fileName: string;
      options?: OpenOptions;
      // Either a URL (worker fetches + streams: the 400 MB payload never
      // touches the main thread) or transferred bytes.
      url?: string;
      bytes?: ArrayBuffer;
    }
  | { op: "metadata"; handle: number }
  | { op: "activateSheet"; handle: number; sheet: number }
  | {
      op: "viewport";
      handle: number;
      sheet: number;
      rows: [number, number];
      cols: [number, number];
      mode: DisplayMode;
    }
  | { op: "rowsBatch"; handle: number; sheet: number; startRow: number; rowCount: number }
  | { op: "styles"; handle: number }
  | { op: "geometry"; handle: number; sheet: number }
  | { op: "search"; handle: number; query: string; options?: SearchOpts }
  | { op: "close"; handle: number }
  | { op: "cancel"; targetId: number }
);

export type EngineResponse =
  | { id: number; kind: "ok"; result: unknown }
  | { id: number; kind: "error"; error: EngineError }
  | { id: number; kind: "progress"; progress: Progress };

/** Minimal worker surface the client needs; satisfied by a browser `Worker`
 * and by test transports (MessageChannel ports, in-process loopback). */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  terminate(): void;
}
