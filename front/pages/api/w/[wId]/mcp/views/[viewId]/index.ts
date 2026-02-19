import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const PatchMCPServerViewBodySchema = z
  .object({
    oAuthUseCase: z.enum(["platform_actions", "personal_actions"]),
  })
  .or(
    z.object({
      name: z.string().nullable(),
      description: z.string().nullable(),
    })
  );

export type PatchMCPServerViewBody = z.infer<
  typeof PatchMCPServerViewBodySchema
>;

export type PatchMCPServerViewResponseBody = {
  success: true;
  serverView: MCPServerViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchMCPServerViewResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { viewId } = req.query;

  if (typeof viewId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "mcp_auth_error",
        message:
          "You are not authorized to make request to inspect an MCP server view.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const r = PatchMCPServerViewBodySchema.safeParse(req.body);
      if (r.error) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
          status_code: 400,
        });
      }

      // Get the system view to validate that viewId refers to a system view
      const systemView = await MCPServerViewResource.fetchById(auth, viewId);

      if (!systemView) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "mcp_server_view_not_found",
            message: "MCP Server View not found",
          },
        });
      }

      // Validate that this is a system view
      if (systemView.space.kind !== "system") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Updates can only be performed on system views.",
          },
        });
      }

      const mcpServerId = systemView.mcpServerId;

      // Apply updates to all views of the same MCP server in the workspace
      if ("oAuthUseCase" in r.data) {
        const updateResult = await updateOAuthUseCaseForMCPServerViews(auth, {
          mcpServerId,
          oAuthUseCase: r.data.oAuthUseCase,
        });

        if (updateResult.isErr()) {
          switch (updateResult.error.code) {
            case "unauthorized":
              return apiError(req, res, {
                status_code: 401,
                api_error: {
                  type: "workspace_auth_error",
                  message:
                    "You are not authorized to update the MCP server view.",
                },
              });
            case "mcp_server_view_not_found":
              return apiError(req, res, {
                status_code: 404,
                api_error: {
                  type: "mcp_server_view_not_found",
                  message: "Could not find the associated MCP server views.",
                },
              });
            default:
              assertNever(updateResult.error.code);
          }
        }
      } else if ("name" in r.data && "description" in r.data) {
        const updateResult = await updateNameAndDescriptionForMCPServerViews(
          auth,
          {
            mcpServerId,
            name: r.data.name ?? undefined,
            description: r.data.description ?? undefined,
          }
        );

        if (updateResult.isErr()) {
          switch (updateResult.error.code) {
            case "unauthorized":
              return apiError(req, res, {
                status_code: 401,
                api_error: {
                  type: "workspace_auth_error",
                  message:
                    "You are not authorized to update the MCP server view.",
                },
              });
            case "mcp_server_view_not_found":
              return apiError(req, res, {
                status_code: 404,
                api_error: {
                  type: "mcp_server_view_not_found",
                  message: "Could not find the associated MCP server views.",
                },
              });
            default:
              assertNever(updateResult.error.code);
          }
        }
      }

      // Fetch the updated system view to return
      const updatedSystemView = await MCPServerViewResource.fetchById(
        auth,
        viewId
      );

      if (!updatedSystemView) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "mcp_server_view_not_found",
            message: "MCP Server View not found after update",
          },
        });
      }

      return res.status(200).json({
        success: true,
        serverView: updatedSystemView.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

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

async function updateOAuthUseCaseForMCPServerViews(
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

async function updateNameAndDescriptionForMCPServerViews(
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
  Result<undefined, DustError<"mcp_server_view_not_found" | "unauthorized">>
> {
  const r = await getAllMCPServerViewsInWorkspace(auth, mcpServerId);
  if (r.isErr()) {
    return r;
  }
  const views = r.value;

  for (const view of views) {
    const result = await view.updateNameAndDescription(auth, name, description);
    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}
