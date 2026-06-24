import type { ModelProviderIdType } from "./types";

// Sentinel model used by custom agents that "follow" the workspace default
// model. It is never a real, runnable model: it is resolved to a concrete model
// configuration at the single serialization boundary
// (`getModelForAgentConfiguration`) before it can reach execution. It mirrors
// the `noop` virtual model pattern and is intentionally NOT added to
// `SUPPORTED_MODEL_CONFIGS`, so it never shows up in model pickers or the
// `/models` endpoint.
export const WORKSPACE_DEFAULT_MODEL_ID = "workspace-default" as const;

// The sentinel reuses the virtual `noop` provider: it carries no real provider
// semantics and is always whitelisted, which is harmless because the value is
// resolved away before it is used.
export const WORKSPACE_DEFAULT_MODEL_PROVIDER_ID: ModelProviderIdType = "noop";

export const WORKSPACE_DEFAULT_MODEL_SETTINGS = {
  modelId: WORKSPACE_DEFAULT_MODEL_ID,
  providerId: WORKSPACE_DEFAULT_MODEL_PROVIDER_ID,
} as const;

export function isFollowingWorkspaceDefaultModel(model: {
  modelId: string;
}): boolean {
  return model.modelId === WORKSPACE_DEFAULT_MODEL_ID;
}
