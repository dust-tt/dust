import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  GET_WORKSPACE_METADATA_TOOL_NAME,
  POKE_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/poke/metadata";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { isDustWorkspace } from "@app/types/shared/env";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@dust-tt/client/src/error_utils";

const handlers: ToolHandlers<typeof POKE_TOOLS_METADATA> = {
  [GET_WORKSPACE_METADATA_TOOL_NAME]: async ({ workspace_id }, { auth }) => {
    const callerWorkspace = auth.getNonNullableWorkspace();
    const callerUser = auth.user();

    // ──────────────────────────────────────────────────────────────────────
    // SECURITY GATE 1: Verify the caller is a Dust super user.
    // This checks both the user's isDustSuperUser flag AND that their email
    // matches @dust.tt (or we're in development mode).
    // ──────────────────────────────────────────────────────────────────────
    if (!auth.isDustSuperUser()) {
      return new Err(
        new MCPError(
          "Access denied: poke tools require Dust super user privileges."
        )
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // SECURITY GATE 2: Verify the caller's workspace is a Dust-internal
    // workspace. This prevents a super user whose account is compromised in
    // a non-Dust workspace from invoking cross-workspace tools.
    // ──────────────────────────────────────────────────────────────────────
    if (!isDustWorkspace(callerWorkspace)) {
      return new Err(
        new MCPError(
          "Access denied: poke tools can only be used from a Dust-internal workspace."
        )
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // SECURITY GATE 3: Re-check the poke_mcp feature flag at execution
    // time (not just at server configuration time). This ensures that if
    // the flag is revoked, already-configured agents stop working.
    // ──────────────────────────────────────────────────────────────────────
    const featureFlags = await getFeatureFlags(callerWorkspace);
    if (!featureFlags.includes("poke_mcp")) {
      return new Err(
        new MCPError(
          "Access denied: the poke_mcp feature flag is not enabled on this workspace."
        )
      );
    }

    // ──────────────────────────────────────────────────────────────────────
    // AUDIT LOG: Structured log entry for cross-workspace access.
    // Uses a distinct action field so Datadog can alert on it.
    // Fields: action, callerUserId, callerUserEmail, callerWorkspaceSId,
    // targetWorkspaceSId, tool.
    // ──────────────────────────────────────────────────────────────────────
    logger.info(
      {
        action: "poke_cross_workspace_access",
        callerUserId: callerUser?.id,
        callerUserEmail: callerUser?.email,
        callerWorkspaceSId: callerWorkspace.sId,
        targetWorkspaceSId: workspace_id,
        tool: GET_WORKSPACE_METADATA_TOOL_NAME,
      },
      "Poke MCP: cross-workspace metadata access"
    );

    // Create an admin authenticator for the target workspace.
    let targetAuth: Authenticator;
    try {
      targetAuth = await Authenticator.internalAdminForWorkspace(workspace_id);
    } catch (err) {
      const normalizedErr = normalizeError(err);
      logger.error(
        { err: normalizedErr },
        "Failed to create authenticator for workspace"
      );
      return new Err(
        new MCPError(
          `Workspace not found: no workspace with sId "${workspace_id}" exists.`,
          { tracked: false }
        )
      );
    }

    const targetWorkspace = targetAuth.getNonNullableWorkspace();
    const plan = targetAuth.plan();

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sId: targetWorkspace.sId,
            name: targetWorkspace.name,
            segmentation: targetWorkspace.segmentation,
            ssoEnforced:
              "ssoEnforced" in targetWorkspace
                ? targetWorkspace.ssoEnforced
                : undefined,
            plan: plan
              ? {
                  code: plan.code,
                  name: plan.name,
                }
              : null,
          },
          null,
          2
        ),
      },
    ]);
  },
};

export const TOOLS = buildTools(POKE_TOOLS_METADATA, handlers);
