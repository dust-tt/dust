import config from "@app/lib/api/config";
import { providerToProfile } from "@app/lib/api/sandbox/image/profile";
import {
  getRegisteredImages,
  getSandboxImageFromRegistry,
} from "@app/lib/api/sandbox/image/registry";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { ToolEntry } from "@app/lib/api/sandbox/image/types";
import { DSBX_TOOL_NAME } from "@app/lib/api/sandbox/image/types";
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

// Hacky temporary filtering: strip the `dsbx` tool entry from the manifest by
// name when sandbox tools are off so it is not advertised to the model.
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

  const image = imageResult.value;

  // Dev-only: bypass all egress restrictions. Pairs with skipping the dsbx
  // forwarder + tearing down in-sandbox nftables in tools/index.ts.
  if (isDevelopment() && config.getSandboxDevUnrestrictedEgress()) {
    return new Ok(image.withNetwork({ mode: "allow_all" }));
  }

  const devHost = isDevelopment()
    ? config.getSandboxDevFrontHostName()
    : undefined;
  const frontHost = devHost ?? new URL(config.getApiBaseUrl()).hostname;

  return new Ok(
    image.withNetwork({
      mode: image.network.mode,
      // The semantic filesystem adapter runs as a dedicated service user and
      // calls this host with a short-lived, mount-scoped JWT. Workload users
      // remain redirected through the regular per-owner egress policy.
      allowlist: [...(image.network.allowlist ?? []), frontHost],
    })
  );
}

export { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
export {
  createToolManifest,
  toolManifestToCompactText,
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
