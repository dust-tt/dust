import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { FileResource } from "@app/lib/resources/file_resource";
import { parseFrameManifest } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type FrameEntrySourceError = DustError<"file_not_found" | "invalid_file">;

/**
 * @cc [owner:davidebbo,label:product] frame-entry-source-reads-current-sources
 * Returns the Frame's UI entry file as it currently stands in its source folder, resolved through
 * the `uiEntryPoint` of the `manifest.json` sitting next to it. It must never return the built
 * bundle the Frame renders, and must fail with `file_not_found` when the Frame has no source
 * folder, no manifest, or no file at the manifest's entry point.
 */
export async function readFrameV2EntrySource(
  auth: Authenticator,
  frame: FileResource
): Promise<Result<string, FrameEntrySourceError>> {
  const manifestPath = frame.toScopedPath(auth);
  const sourceDirectory = frame.getFrameV2SourceDirectoryPath(auth);
  if (!manifestPath || !sourceDirectory) {
    return new Err(
      new DustError("file_not_found", "Frame source folder not found.")
    );
  }

  const fileSystemResult = await DustFileSystem.fromScopedPath(
    auth,
    manifestPath
  );
  if (fileSystemResult.isErr()) {
    return new Err(
      new DustError("file_not_found", fileSystemResult.error.message)
    );
  }
  const dustFs = fileSystemResult.value;

  const manifestBuffer = await dustFs.readBuffer(manifestPath);
  if (manifestBuffer.isErr()) {
    return new Err(
      new DustError("file_not_found", manifestBuffer.error.message)
    );
  }
  if (manifestBuffer.value === null) {
    return new Err(
      new DustError(
        "file_not_found",
        `Frame manifest not found: ${manifestPath}`
      )
    );
  }

  const manifest = parseFrameManifest(manifestBuffer.value);
  if (manifest.isErr()) {
    return new Err(new DustError("invalid_file", manifest.error));
  }

  const entryPath = path.posix.join(
    sourceDirectory,
    manifest.value.uiEntryPoint
  );
  const entryBuffer = await dustFs.readBuffer(entryPath);
  if (entryBuffer.isErr()) {
    return new Err(new DustError("file_not_found", entryBuffer.error.message));
  }
  if (entryBuffer.value === null) {
    return new Err(
      new DustError(
        "file_not_found",
        `Frame entry file not found: ${manifest.value.uiEntryPoint}`
      )
    );
  }

  return new Ok(entryBuffer.value.toString("utf-8"));
}
