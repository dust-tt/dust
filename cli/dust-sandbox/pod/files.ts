// The Frame's durable files folder.
//
// A Frame owns one folder that persists across invocations and publications,
// gcsfuse-mounted read-write into its sandbox. Function source gets its
// absolute path from filesDir() and uses it with `node:fs` like any other
// directory; nothing here wraps those calls.
//
// The path is resolved from the environment front sets per exec and is never
// hardcoded here (front's `frame-data-files-dir-single-source` contract). It is
// read through podEnv() rather than process.env so a resident worker serving
// two invocations resolves each against its own environment.
//
// Two properties of the folder shape how it should be used:
//
//  - It is a GCS bucket behind a FUSE mount, so there are no partial writes.
//    Write whole files; appending to or seeking within one rewrites the whole
//    object. Never put a SQLite database here — that is what `db()` is for.
//  - Nothing validates what gets written, so a file's name says nothing about
//    its bytes. Code that later serves a file MUST choose the content type
//    from a fixed list rather than from the file name, and must never serve a
//    type that can execute script (svg, html).

import { podEnv } from "./context.ts";

/**
 * Env var carrying the absolute in-sandbox path of the Frame's files folder.
 * Set per exec by front; no fallback lives below front, so an absent value is
 * an error rather than a guess at the location.
 */
export const FRAME_DATA_FILES_DIR_ENV = "DUST_FRAME_DATA_FILES_DIR";

export class FrameFilesUnavailableError extends Error {
  constructor() {
    super(
      `${FRAME_DATA_FILES_DIR_ENV} is not set: the files folder is available to ` +
        `Frame functions only.`
    );
    this.name = "FrameFilesUnavailableError";
  }
}

/**
 * Absolute path of the Frame's files folder, for use with `node:fs`.
 *
 * A name that reaches the folder from a viewer can contain `..` and resolve
 * above this path, where the sandbox has writable directories: the write then
 * succeeds onto local disk that the Frame loses when its sandbox recycles.
 * Code joining a caller-supplied name MUST check the resolved path is still
 * under this folder.
 *
 * @throws FrameFilesUnavailableError when called outside a Frame function,
 *   where the folder is not mounted.
 */
export function filesDir(): string {
  const dir = podEnv(FRAME_DATA_FILES_DIR_ENV);
  if (dir === undefined || dir === "") {
    throw new FrameFilesUnavailableError();
  }

  return dir;
}
