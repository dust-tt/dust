import config from "@app/lib/api/config";
import {
  getRegisteredImages,
  getSandboxImageFromRegistry,
} from "@app/lib/api/sandbox/image/registry";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { ToolEntry, ToolProfile } from "@app/lib/api/sandbox/image/types";
import type { Authenticator } from "@app/lib/auth";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { isDevelopment } from "@app/types/shared/env";
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
  providerId: ModelProviderIdType,
  {
    includeDsbxTools = true,
  }: {
    includeDsbxTools?: boolean;
  } = {}
): Result<readonly ToolEntry[], Error> {
  const imageResult = getSandboxImageFromRegistry({ name: "dust-base" });
  if (imageResult.isErr()) {
    return new Err(new Error("Default sandbox image not found in registry"));
  }

  const allTools = imageResult.value.tools;
  const profile = providerToProfile(providerId);

  const providerTools = allTools.filter(
    (tool) => !tool.profile || tool.profile === profile
  );

  return new Ok(filterDsbxToolEntries(providerTools, { includeDsbxTools }));
}

export function filterDsbxToolEntries(
  tools: readonly ToolEntry[],
  { includeDsbxTools }: { includeDsbxTools: boolean }
): readonly ToolEntry[] {
  if (includeDsbxTools) {
    return tools;
  }

  return tools.filter((tool) => tool.name !== "dsbx");
}

export function getSandboxImage(
  _auth?: Authenticator
): Result<SandboxImage, Error> {
  const imageResult = getSandboxImageFromRegistry({ name: "dust-base" });
  if (imageResult.isErr()) {
    return imageResult;
  }

  if (!isDevelopment()) {
    return imageResult;
  }

  const devHost = config.getSandboxDevFrontHostName();
  if (!devHost) {
    return imageResult;
  }

  const image = imageResult.value;
  return new Ok(
    image.withNetwork({
      mode: image.network.mode,
      allowlist: [...(image.network.allowlist ?? []), devHost],
    })
  );
}

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
  SandboxCapability,
  SandboxImageId,
  SandboxResources,
  ToolEntry,
  ToolManifest,
  ToolProfile,
  ToolRuntime,
} from "@app/lib/api/sandbox/image/types";
export { formatSandboxImageId } from "@app/lib/api/sandbox/image/types";
export { getRegisteredImages, getSandboxImageFromRegistry };
