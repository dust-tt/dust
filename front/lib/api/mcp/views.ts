import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { destroyAgentMCPServerConfigurationsForViews } from "@app/lib/models/agent/actions/mcp_server_view_helper";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { Op } from "sequelize";
import { z } from "zod";

export const PatchMCPServerViewBodySchema = z
  .object({
    oAuthUseCase: z.enum(["platform_actions", "personal_actions"]),
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

/**
 * @swaggerschema PrivatePatchMCPServerViewBody (swagger_private_schemas.ts)
 */
export type PatchMCPServerViewBody = z.infer<
  typeof PatchMCPServerViewBodySchema
>;

/**
 * @swaggerschema PrivatePatchMCPServerViewResponseBody (swagger_private_schemas.ts)
 */
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
  }: {
    mcpServerId: string;
    oAuthUseCase: MCPOAuthUseCase;
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
    const result = await view.updateOAuthUseCase(auth, oAuthUseCase);
    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}

export async function updateIsRestrictedToSkillsForMCPServerViews(
  auth: Authenticator,
  {
    mcpServerId,
    isRestrictedToSkills,
  }: {
    mcpServerId: string;
    isRestrictedToSkills: boolean;
  }
): Promise<
  Result<undefined, DustError<"mcp_server_view_not_found" | "unauthorized">>
> {
  const r = await getAllMCPServerViewsInWorkspace(auth, mcpServerId);
  if (r.isErr()) {
    return r;
  }
  const views = r.value;

  if (views.some((view) => !view.canAdministrate(auth))) {
    return new Err(
      new DustError(
        "unauthorized",
        "Not allowed to update skill-only availability."
      )
    );
  }

  await withTransaction(async (transaction) => {
    await MCPServerViewModel.update(
      {
        isRestrictedToSkills,
        editedAt: new Date(),
        editedByUserId: auth.getNonNullableUser().id,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: { [Op.in]: views.map((view) => view.id) },
        },
        transaction,
      }
    );

    if (isRestrictedToSkills) {
      await destroyAgentMCPServerConfigurationsForViews(auth, {
        mcpServerViewIds: views.map((view) => view.id),
        transaction,
      });
    }
  });

  return new Ok(undefined);
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
      const systemViews = await MCPServerViewResource.listBySpace(
        auth,
        systemView.space
      );
      const hasConflict = systemViews.some((v) => {
        if (v.mcpServerId === mcpServerId) {
          return false;
        }
        return (v.name ?? v.getServerDisplayMetadata().name) === name;
      });

      if (hasConflict) {
        return new Err(
          new DustError(
            "name_conflict",
            `An existing tool is already using the name "${name}".`
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
