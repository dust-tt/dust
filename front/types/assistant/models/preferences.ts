import { isModelId } from "@app/types/assistant/models/models";
import { isModelProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";

export const WORKSPACE_DEFAULT_MODEL_METADATA_KEY =
  "defaultModelConfiguration";
export const WORKSPACE_BACKUP_MODEL_METADATA_KEY = "backupModelConfiguration";

export type WorkspaceModelPreference = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
};

type WorkspaceMetadata =
  | Record<string, string | number | boolean | object | undefined>
  | null
  | undefined;

function isWorkspaceModelPreference(
  value: unknown
): value is WorkspaceModelPreference {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { providerId, modelId } = value as Record<string, unknown>;

  return (
    typeof providerId === "string" &&
    typeof modelId === "string" &&
    isModelProviderId(providerId) &&
    isModelId(modelId)
  );
}

function getWorkspaceModelPreferenceFromMetadata(
  metadata: WorkspaceMetadata,
  key: string
): WorkspaceModelPreference | null {
  const value = metadata?.[key];

  return isWorkspaceModelPreference(value) ? value : null;
}

export function getWorkspaceDefaultModelPreference(
  metadata: WorkspaceMetadata
): WorkspaceModelPreference | null {
  return getWorkspaceModelPreferenceFromMetadata(
    metadata,
    WORKSPACE_DEFAULT_MODEL_METADATA_KEY
  );
}

export function getWorkspaceBackupModelPreference(
  metadata: WorkspaceMetadata
): WorkspaceModelPreference | null {
  return getWorkspaceModelPreferenceFromMetadata(
    metadata,
    WORKSPACE_BACKUP_MODEL_METADATA_KEY
  );
}
