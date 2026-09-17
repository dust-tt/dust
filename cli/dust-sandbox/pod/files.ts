// The Frame's durable files folder.
//
// A Frame owns one folder that persists across invocations and publications,
// gcsfuse-mounted read-write into its sandbox. It is the place for bytes a
// function needs to keep — viewer uploads, generated documents — while the
// row describing them (who, when, which path) belongs in a Frame database.
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

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import { podEnv } from "./context.ts";

/**
 * Env var carrying the absolute in-sandbox path of the Frame's files folder.
 * Set per exec by front; no fallback lives below front, so an absent value is
 * an error rather than a guess at the location.
 */
export const FRAME_DATA_FILES_DIR_ENV = "DUST_FRAME_DATA_FILES_DIR";

export class FrameFilesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameFilesError";
  }
}

export class FrameFilesUnavailableError extends FrameFilesError {
  constructor() {
    super(
      `${FRAME_DATA_FILES_DIR_ENV} is not set: the files folder is available to ` +
        `Frame functions only.`
    );
    this.name = "FrameFilesUnavailableError";
  }
}

export class FrameFilePathError extends FrameFilesError {
  constructor(
    readonly relativePath: string,
    reason: string
  ) {
    super(`Invalid Frame file path ${JSON.stringify(relativePath)}: ${reason}`);
    this.name = "FrameFilePathError";
  }
}

/**
 * Absolute path of the Frame's files folder.
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

/**
 * Absolute path of `relativePath` inside the Frame's files folder, for use
 * with `node:fs`.
 *
 * Always build paths with this rather than interpolating into `filesDir()`:
 * a name that reaches the folder from a viewer can contain `..`, and the
 * sandbox has writable directories above the mount. A path that would resolve
 * outside the folder is refused.
 *
 * A viewer-supplied name failing this check is an expected outcome, not a bug:
 * catch it with `error instanceof FrameFilePathError` and answer 400, rather
 * than letting the invocation end as an internal error.
 *
 * @throws FrameFilePathError when `relativePath` is empty, absolute, contains
 *   a null byte, or resolves to the folder itself or outside it.
 * @throws FrameFilesUnavailableError when called outside a Frame function.
 */
export function filePath(relativePath: string): string {
  if (relativePath === "") {
    throw new FrameFilePathError(relativePath, "the path is empty");
  }
  if (isAbsolute(relativePath)) {
    throw new FrameFilePathError(relativePath, "the path must be relative");
  }
  if (relativePath.includes("\0")) {
    throw new FrameFilePathError(relativePath, "the path contains a null byte");
  }

  const root = filesDir();
  const resolved = resolve(root, relativePath);
  // `resolve` collapses `..`, so comparing afterwards catches every way out of
  // the folder, including a segment that only escapes once normalized.
  if (resolved !== root && !resolved.startsWith(join(root, sep))) {
    throw new FrameFilePathError(
      relativePath,
      "the path resolves outside the files folder"
    );
  }
  if (resolved === root) {
    throw new FrameFilePathError(relativePath, "the path is the folder itself");
  }

  return resolved;
}

/**
 * Read and write the Frame's files folder.
 *
 * `write` creates missing parent directories: the folder starts empty, and
 * `node:fs` writeFile fails with ENOENT rather than creating them, which is a
 * wall every first write into a subdirectory hits otherwise.
 *
 * Each call is a GCS round trip — the mount holds no metadata cache — so a
 * write followed by a read of the same file is two transfers of the payload.
 * Do the write in one function and let the UI fetch the bytes from another
 * rather than returning them from the call that stored them: a `fast` function
 * has a 10-second ceiling and doing both in one call can exceed it.
 *
 * @throws FrameFilePathError from every method taking a `relativePath`, on the
 *   conditions listed on `filePath`.
 * @throws FrameFilesUnavailableError from every method when called outside a
 *   Frame function.
 */
export const files = {
  /** Write `data` to `relativePath`, creating parent directories as needed. */
  async write(
    relativePath: string,
    data: Uint8Array | string
  ): Promise<string> {
    const absolutePath = filePath(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, data);

    return absolutePath;
  },

  /** Read `relativePath`. Rejects with ENOENT when it does not exist. */
  async read(relativePath: string): Promise<Buffer> {
    return readFile(filePath(relativePath));
  },

  /**
   * Names directly inside `relativePath`, or the folder root when omitted.
   * Returns an empty list for a directory that does not exist, so a Frame that
   * has never written anything does not have to special-case its first read.
   */
  async list(relativePath?: string): Promise<string[]> {
    const absolutePath =
      relativePath === undefined ? filesDir() : filePath(relativePath);
    try {
      return await readdir(absolutePath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
  },

  /** Delete `relativePath`. Succeeds when it is already absent. */
  async remove(relativePath: string): Promise<void> {
    await rm(filePath(relativePath), { force: true, recursive: true });
  },
};
