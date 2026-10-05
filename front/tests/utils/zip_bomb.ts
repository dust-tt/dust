import AdmZip from "adm-zip";
import zlib from "node:zlib";
import { vi } from "vitest";

/**
 * Builds a ZIP holding a single deflated entry of `inflatedSizeBytes` whose
 * declared size and CRC are patched to 0 in both the local and central headers.
 */
export function makeZipBombBuffer(
  entryName: string,
  inflatedSizeBytes: number
): Buffer {
  const zip = new AdmZip();
  zip.addFile(entryName, Buffer.alloc(inflatedSizeBytes, "a"));
  const zipBuffer = zip.toBuffer();

  const localHeaderOffset = zipBuffer.indexOf(
    Buffer.from([0x50, 0x4b, 0x03, 0x04])
  );
  zipBuffer.writeUInt32LE(0, localHeaderOffset + 14);
  zipBuffer.writeUInt32LE(0, localHeaderOffset + 22);
  const centralHeaderOffset = zipBuffer.indexOf(
    Buffer.from([0x50, 0x4b, 0x01, 0x02])
  );
  zipBuffer.writeUInt32LE(0, centralHeaderOffset + 16);
  zipBuffer.writeUInt32LE(0, centralHeaderOffset + 24);

  return zipBuffer;
}

/**
 * Counts the bytes produced by `zlib.inflateRawSync`, which adm-zip uses to
 * read deflated entries. Restore with `vi.restoreAllMocks()`.
 */
export function spyOnInflatedBytes(): { total: number } {
  const inflated = { total: 0 };
  const inflateRawSync = zlib.inflateRawSync;
  vi.spyOn(zlib, "inflateRawSync").mockImplementation((buffer, options) => {
    const result = inflateRawSync(buffer, options);
    inflated.total += result.length;
    return result;
  });
  return inflated;
}
