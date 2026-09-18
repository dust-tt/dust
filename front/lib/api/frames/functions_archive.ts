import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";

import { TarArchive } from "archiver";

export const FRAME_FUNCTIONS_ARCHIVE_CONTENT_TYPE = "application/x-tar";

/**
 * Build an uncompressed ustar archive with one `<name>.ts` entry per function
 * artifact. Stored alongside the individual GCS objects so cold invocation can
 * materialize the whole set with one object read instead of listing the
 * uncached gcsfuse functions directory.
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
    archive.append(entry.content, { name: `${entry.name}.ts` });
  }

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}
