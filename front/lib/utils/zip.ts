import type { IZipEntry } from "adm-zip";

/**
 * @cc [owner:sfriquet,label:security;performance] zip-entry-read-bounded-by-declared-size
 * MUST NOT decompress more than the entry's declared `header.size` bytes. An
 * entry declaring a size of 0 MUST yield an empty buffer without being
 * decompressed, whatever its compressed size. Code bounding decompression by
 * summing declared `header.size` MUST read entry data only through this
 * function.
 */
export function readZipEntryData(entry: IZipEntry): Buffer {
  if (entry.header.size === 0) {
    return Buffer.alloc(0);
  }
  return entry.getData();
}
