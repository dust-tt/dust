import type { Authenticator } from "@app/lib/auth";

import { DUST_BASE_IMAGE } from "./dust-base";
import type { SandboxImage } from "./sandbox_image";

export function getSandboxImage(_auth?: Authenticator): SandboxImage {
  return DUST_BASE_IMAGE;
}
export { SandboxImage } from "./sandbox_image";
export {
  createToolManifest,
  toolManifestToJSON,
  toolManifestToYAML,
} from "./tool_manifest";
export type {
  BaseImage,
  NetworkMode,
  NetworkPolicy,
  Operation,
  SandboxImageId,
  SandboxImageName,
  SandboxImageTag,
  SandboxResources,
  ToolEntry,
  ToolManifest,
} from "./types";
export {
  DUST_SANDBOX_IMAGE_ID,
  formatSandboxImageId,
  getSandboxImageNames,
  getSandboxImageTags,
  isValidSandboxImageName,
  isValidSandboxImageTag,
} from "./types";
