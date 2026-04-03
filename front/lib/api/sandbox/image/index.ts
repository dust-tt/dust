import config from "@app/lib/api/config";
import { providerToProfile } from "@app/lib/api/sandbox/image/profile";
import {
  getRegisteredImages,
  getSandboxImageFromRegistry,
} from "@app/lib/api/sandbox/image/registry";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import {
  DSBX_TOOL_NAME,
  type ToolEntry,
  type ToolProfile,
} from "@app/lib/api/sandbox/image/types";
import type { Authenticator } from "@app/lib/auth";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

  const providerTools = allTools.filter((tool) => {
    if (!tool.profile) {
      return true;
    }
    if (Array.isArray(tool.profile)) {
      return tool.profile.includes(profile);
    }
    return tool.profile === profile;
  });

  return new Ok(filterDsbxToolEntries(providerTools, { includeDsbxTools }));
}

// TODO(dsbx-tools): Hacky temporary filtering — we strip the `dsbx` tool
// entry from the manifest by name when the `sandbox_dsbx_tools` flag is
// off so it is not advertised to the model. Remove once `dsbx tools` ships
// to all sandbox-enabled workspaces and the flag goes away.
export function filterDsbxToolEntries(
  tools: readonly ToolEntry[],
  { includeDsbxTools }: { includeDsbxTools: boolean }
): readonly ToolEntry[] {
  if (includeDsbxTools) {
    return tools;
  }

  return tools.filter((tool) => tool.name !== DSBX_TOOL_NAME);
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
