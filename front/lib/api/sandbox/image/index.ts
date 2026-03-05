import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

import {
  getRequiredSandboxImages,
  getSandboxImageFromRegistry,
  getSandboxImageFromRegistryByName,
} from "./registry";
import type { SandboxImage } from "./sandbox_image";

export function getSandboxImage(
  _auth?: Authenticator
): Result<SandboxImage, Error> {
  const result = getSandboxImageFromRegistry({
    imageName: "dust-base",
    tag: "production",
  });
  if (result.isErr()) {
    return new Err(new Error("Default sandbox image not found in registry"));
  }
  return result;
}

export {
  getRequiredSandboxImages,
  getSandboxImageFromRegistry,
  getSandboxImageFromRegistryByName,
};
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
