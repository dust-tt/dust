import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { isDustWorkspace } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Runs the three security gates required by every poke tool, then emits the
 * structured audit log entry.
 *
 * Gate 1: caller must be a Dust super user.
 * Gate 2: caller workspace must be the Dust-internal workspace.
 * Gate 3: poke_mcp feature flag must be enabled at execution time.
 *
 * Returns Ok(void) when all gates pass, or Err(MCPError) on the first failure.
 */
export async function enforcePokeSecurityGates(
  { auth }: ToolHandlerExtra,
  toolName: string,
  targetWorkspaceSId: string
): Promise<Result<void, MCPError>> {
  const callerWorkspace = auth.getNonNullableWorkspace();
  const callerUser = auth.user();

  if (!auth.isDustSuperUser()) {
    return new Err(
      new MCPError(
        "Access denied: poke tools require Dust super user privileges."
      )
    );
  }

  if (!isDustWorkspace(callerWorkspace)) {
    return new Err(
      new MCPError(
        "Access denied: poke tools can only be used from a Dust-internal workspace."
      )
    );
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("poke_mcp")) {
    return new Err(
      new MCPError(
        "Access denied: the poke_mcp feature flag is not enabled on this workspace."
      )
    );
  }

  logger.info(
    {
      action: "poke_cross_workspace_access",
      callerUserSId: callerUser?.sId,
      callerUserEmail: callerUser?.email,
      callerWorkspaceSId: callerWorkspace.sId,
      targetWorkspaceSId,
      tool: toolName,
    },
    "Poke MCP: cross-workspace access"
  );

  return new Ok(undefined);
}

/**
 * Creates an admin authenticator for the target workspace, with consistent
 * error handling. Returns Err(MCPError) if the workspace does not exist.
 */
export async function getTargetAuth(
  workspaceSId: string
): Promise<Result<Authenticator, MCPError>> {
  try {
    const targetAuth =
      await Authenticator.internalAdminForWorkspace(workspaceSId);
    return new Ok(targetAuth);
  } catch (err) {
    const normalizedErr = normalizeError(err);
    logger.error(
      { err: normalizedErr },
      "Failed to create authenticator for workspace"
    );
    return new Err(
      new MCPError(
        `Workspace not found: no workspace with sId "${workspaceSId}" exists.`,
        { tracked: false }
      )
    );
  }
}
