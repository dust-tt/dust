import {
  getRegisteredImages,
  getSandboxImageFromRegistry,
} from "@app/lib/api/sandbox/image/registry";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";

export function getSandboxImage(
  _auth?: Authenticator
): Result<SandboxImage, Error> {
  return getSandboxImageFromRegistry({ name: "dust-base" });
}

export { getRegisteredImages, getSandboxImageFromRegistry };
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
  SandboxResources,
  ToolEntry,
  ToolManifest,
} from "@app/lib/api/sandbox/image/types";
export { formatSandboxImageId } from "@app/lib/api/sandbox/image/types";
