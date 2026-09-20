import path from "node:path";
import {
  FRAME_MANIFEST_FILE,
  MAX_FRAME_NAME_LENGTH,
} from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:davidebbo,label:product;backend] frame-name-is-the-source-folder
 * A Frames v2 package is named by the folder holding its `manifest.json`, and by nothing else.
 * `useCaseMetadata.frameName` is a projection of that folder name: it MUST be written only when
 * the Frame is registered and when it is renamed. Publication activation MUST NOT write it, and
 * the manifest MUST NOT carry a name, otherwise the served name drifts from the folder that the
 * file explorer displays.
 */
export function getFrameV2NameFromMountFilePath(
  mountFilePath: string
): string | null {
  if (path.posix.basename(mountFilePath) !== FRAME_MANIFEST_FILE) {
    return null;
  }

  const directory = path.posix.dirname(mountFilePath);
  if (directory === "." || directory === "/") {
    return null;
  }

  const name = path.posix.basename(directory);
  return name.length > 0 ? name : null;
}

/**
 * @cc [owner:davidebbo,label:product;backend] frame-name-is-one-path-segment
 * A Frame name MUST be a single non-empty path segment of at most `MAX_FRAME_NAME_LENGTH`
 * characters, and MUST NOT be `.` or `..`. Renaming moves the source folder, so a name carrying a
 * separator or a relative segment would escape the Frame's parent directory.
 */
export function validateFrameV2Name(name: string): Result<string, string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return new Err("Frame name cannot be empty.");
  }
  if (trimmed.length > MAX_FRAME_NAME_LENGTH) {
    return new Err(
      `Frame name cannot exceed ${MAX_FRAME_NAME_LENGTH} characters.`
    );
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return new Err("Frame name cannot contain path separators.");
  }
  if (trimmed === "." || trimmed === "..") {
    return new Err("Frame name cannot be '.' or '..'.");
  }

  return new Ok(trimmed);
}
