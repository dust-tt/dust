import {
  getRequiredSandboxImages,
  getSandboxImageFromRegistry,
  getSandboxImageFromRegistryByName,
} from "@app/lib/api/sandbox/image/registry";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { ToolEntry, ToolProfile } from "@app/lib/api/sandbox/image/types";
import type { Authenticator } from "@app/lib/auth";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

function providerToProfile(providerId: ModelProviderIdType): ToolProfile {
  switch (providerId) {
    case "openai":
      return "openai";
    case "google_ai_studio":
      return "gemini";
    case "anthropic":
    case "mistral":
    case "deepseek":
    case "togetherai":
    case "xai":
    case "fireworks":
    case "noop":
      return "anthropic";
    default:
      assertNever(providerId);
  }
}

export function getToolsForProvider(
  _auth: Authenticator,
  providerId?: ModelProviderIdType
): Result<readonly ToolEntry[], Error> {
  const imageResult = getSandboxImageFromRegistry({
    imageName: "dust-base",
    tag: "v0.2.0",
  });
  if (imageResult.isErr()) {
    return new Err(new Error("Default sandbox image not found in registry"));
  }

  const allTools = imageResult.value.tools;

  if (!providerId) {
    return new Ok(allTools.filter((tool) => !tool.profile));
  }

  const profile = providerToProfile(providerId);
  return new Ok(
    allTools.filter((tool) => !tool.profile || tool.profile === profile)
  );
}

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
  ToolProfile,
  ToolRuntime,
} from "@app/lib/api/sandbox/image/types";
export {
  DUST_SANDBOX_IMAGE_ID,
  formatSandboxImageId,
  getSandboxImageNames,
  getSandboxImageTags,
  isValidSandboxImageName,
  isValidSandboxImageTag,
} from "@app/lib/api/sandbox/image/types";
