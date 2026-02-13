import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { decrypt } from "@app/types/shared/utils/hashing";
import ValTown from "@valtown/sdk";

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

export async function getValTownClient(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<ValTown | null> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
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
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;

  if (!apiKey) {
    return null;
  }

  return new ValTown({
    bearerToken: apiKey,
  });
}
