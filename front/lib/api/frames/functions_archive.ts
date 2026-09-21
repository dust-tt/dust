import { PassThrough, Readable } from "node:stream";
import { finished } from "node:stream/promises";

import { TarArchive } from "archiver";
import { Parser } from "tar";

export const FRAME_FUNCTIONS_ARCHIVE_CONTENT_TYPE = "application/x-tar";

const FRAME_FUNCTION_TAR_ENTRY_SUFFIX = ".ts";

/**
 * Build an uncompressed ustar archive with one `<name>.ts` entry per function
 * artifact. The sole published function payload for a Frame publication: cold
 * invocation materializes every slug with one object read.
 */
export async function buildFrameFunctionsTarArchive(
  entries: ReadonlyArray<{ name: string; content: string }>
): Promise<Buffer> {
  const archive = new TarArchive({ gzip: false });
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  pass.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  const done = finished(pass);
  archive.pipe(pass);

  for (const entry of entries) {
    archive.append(entry.content, {
      name: `${entry.name}${FRAME_FUNCTION_TAR_ENTRY_SUFFIX}`,
    });
  }

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

/**
 * Parse every `<name>.ts` entry from a publication's `functions.tar` into a
 * map keyed by function name (stem without the `.ts` suffix).
 */
export async function parseFrameFunctionsTarArchive(
  archive: Buffer
): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  const parser = new Parser();

  await new Promise<void>((resolve, reject) => {
    parser.on("entry", (entry) => {
      if (entry.type !== "File") {
        entry.resume();
        return;
      }

      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      entry.on("end", () => {
        const path = entry.path.replace(/^\.\//, "");
        if (
          !path.endsWith(FRAME_FUNCTION_TAR_ENTRY_SUFFIX) ||
          path.includes("/")
        ) {
          return;
        }
        const name = path.slice(0, -FRAME_FUNCTION_TAR_ENTRY_SUFFIX.length);
        if (name.length > 0) {
          entries.set(name, Buffer.concat(chunks).toString("utf8"));
        }
      });
    });
    parser.on("end", () => resolve());
    parser.on("error", reject);
    Readable.from(archive).pipe(parser);
  });

  return entries;
}
