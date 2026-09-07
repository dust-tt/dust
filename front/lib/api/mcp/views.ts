import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getMCPServerViewNameConflictMessage } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

export const PatchMCPServerViewBodySchema = z
  .object({
    oAuthUseCase: z.enum(["platform_actions", "personal_actions"]),
    // Sent on activation with the scope the connection was authorized for, so personal connections
    // stay bounded by what the admin consented to. Omitted leaves the stored scope untouched.
    oauthScope: z.string().optional(),
  })
  .or(
    z.object({
      name: z.string().nullable(),
      description: z.string().nullable(),
    })
  )
  .or(
    z.object({
      isRestrictedToSkills: z.boolean(),
    })
  );

export type PatchMCPServerViewBody = z.infer<
  typeof PatchMCPServerViewBodySchema
>;

export type PatchMCPServerViewResponseBody = {
  success: true;
  serverView: MCPServerViewType;
};

async function getAllMCPServerViewsInWorkspace(
  auth: Authenticator,
  mcpServerId: string
): Promise<
  Result<MCPServerViewResource[], DustError<"mcp_server_view_not_found">>
> {
  const views = await MCPServerViewResource.listByMCPServer(auth, mcpServerId);

  if (views.length === 0) {
    return new Err(
      new DustError("mcp_server_view_not_found", "MCP server views not found")
    );
  }

  return new Ok(views);
}

export async function updateOAuthUseCaseForMCPServerViews(
  auth: Authenticator,
  {
    mcpServerId,
    oAuthUseCase,
    oauthScope,
  }: {
    mcpServerId: string;
    oAuthUseCase: MCPOAuthUseCase;
    oauthScope?: string;
  }
): Promise<
  Result<undefined, DustError<"mcp_server_view_not_found" | "unauthorized">>
> {
  const r = await getAllMCPServerViewsInWorkspace(auth, mcpServerId);
  if (r.isErr()) {
    return r;
  }
  const views = r.value;

  for (const view of views) {
    const result = await view.updateOAuthUseCase(
      auth,
      oAuthUseCase,
      oauthScope
    );
    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}

/**
 * Drops the scope pinned on a server's views, called when its workspace connection is deactivated.
 *
 * Paired with the write on activation (`updateOAuthUseCaseForMCPServerViews`, called with the scope
 * the admin just authorized), this keeps `oauthScope` meaning "what the admin last consented to"
 * instead of "the metadata default the day the tool was installed". Deactivating frees the pin so
 * the next activation asks for what the server declares today; activating pins it again so members,
 * whose personal connections read their scope from the view, can never request more than the admin
 * approved. Clearing without that write would leave the view tracking metadata forever, and every
 * scope we later add would reach members with no admin involved.
 *
 * Servers that declare `availableScopes` are left untouched — there the pin is the admin's own scope
 * selection, which reactivation currently preserves since the connect dialog offers no scope picker.
 */
export async function clearPinnedOAuthScopeForMCPServerViews(
  auth: Authenticator,
  { mcpServerId }: { mcpServerId: string }
): Promise<void> {
  const views = await MCPServerViewResource.listByMCPServer(auth, mcpServerId, {
    includeHeavyAttributes: ["authorization"],
  });

  // Every view of a server shares its authorization, so one check covers the whole set.
  if (
    views.length === 0 ||
    views.some((v) => v.getAuthorization()?.availableScopes)
  ) {
    return;
  }

  for (const view of views) {
    if (view.oauthScope === null) {
      continue;
    }

    const result = await view.clearOAuthScope(auth);
    if (result.isErr()) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          mcpServerId,
          mcpServerViewId: view.sId,
          error: result.error,
        },
        "Failed to clear pinned OAuth scope after connection deactivation"
      );
    }
  }
}

export async function updateNameAndDescriptionForMCPServerViews(
  auth: Authenticator,
  {
    mcpServerId,
    name,
    description,
  }: {
    mcpServerId: string;
    name?: string;
    description?: string;
  }
): Promise<
  Result<
    undefined,
    DustError<"mcp_server_view_not_found" | "unauthorized" | "name_conflict">
  >
> {
  const r = await getAllMCPServerViewsInWorkspace(auth, mcpServerId);
  if (r.isErr()) {
    return r;
  }
  const views = r.value;

  // Check for name conflicts in the system space (which contains all tools).
  // Names are set on the system view and propagate to all spaces, so checking
  // the system space is sufficient.
  if (name) {
    const systemView = views.find((v) => v.space.kind === "system");
    if (systemView) {
      await MCPServerViewResource.hydrateRemoteServerHeavyAttributes(
        auth,
        [systemView],
        ["cachedTools"]
      );
      const { hasConflict, conflictDetails } =
        await MCPServerViewResource.hasNameConflictInSpaceByName(
          auth,
          name,
          systemView.space,
          systemView.getServerTools(),
          { excludedMCPServerViewId: systemView.sId }
        );

      if (hasConflict) {
        return new Err(
          new DustError(
            "name_conflict",
            getMCPServerViewNameConflictMessage({
              nameConflict: name,
              ...(conflictDetails ? { conflictDetails } : {}),
            })
          )
        );
      }
    }
  }

  for (const view of views) {
    const result = await view.updateNameAndDescription(auth, name, description);
    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}
