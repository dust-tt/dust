import {
  getRequiredSandboxImages,
  getSandboxImageFromRegistry,
  getSandboxImageFromRegistryByName,
} from "@app/lib/api/sandbox/image/registry";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

export function getSandboxImage(
  _auth?: Authenticator
): Result<SandboxImage, Error> {
  const result = getSandboxImageFromRegistry({
    imageName: "dust-base",
    tag: "v0.2.0",
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
export { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
export {
  createToolManifest,
  toolManifestToJSON,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image/tool_manifest";
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
} from "@app/lib/api/sandbox/image/types";
export {
  DUST_SANDBOX_IMAGE_ID,
  formatSandboxImageId,
  getSandboxImageNames,
  getSandboxImageTags,
  isValidSandboxImageName,
  isValidSandboxImageTag,
} from "@app/lib/api/sandbox/image/types";
