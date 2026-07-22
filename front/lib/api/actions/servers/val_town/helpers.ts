import { ProviderError } from "@app/lib/actions/mcp_errors";
import type { ToolContext } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { decrypt } from "@app/types/shared/utils/encryption";
import ValTown, { APIError } from "@valtown/sdk";

interface ValTownError {
  status?: number;
  message?: string;
}

export function isValTownError(error: unknown): error is ValTownError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("status" in error || "message" in error)
  );
}

// Rethrows Val Town SDK errors carrying a 5xx status as ProviderError: the provider failing
// unexpectedly is tracked by the tool-execution wrapper. 4xx and network errors are left for
// the caller to surface as untracked tool errors.
export function throwIfValTownServerError(error: unknown): void {
  if (
    error instanceof APIError &&
    typeof error.status === "number" &&
    error.status >= 500
  ) {
    throw new ProviderError(
      `Val Town API returned an unexpected error (HTTP ${error.status}).`,
      { status: error.status, cause: error }
    );
  }
}

export async function getValTownClient(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<ValTown | null> {
  const toolConfig = toolContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    return null;
  }

  const secret = await DustAppSecretModel.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const apiKey = secret
    ? decrypt({
        encrypted: secret.hash,
        key: auth.getNonNullableWorkspace().sId,
        useCase: "developer_secret",
      })
    : null;

  if (!apiKey) {
    return null;
  }

  return new ValTown({
    bearerToken: apiKey,
  });
}
