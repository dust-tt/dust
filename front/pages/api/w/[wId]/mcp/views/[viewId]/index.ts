// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  updateNameAndDescriptionForMCPServerViews,
  updateOAuthUseCaseForMCPServerViews,
} from "@app/lib/api/mcp/views";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
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
            case "name_conflict":
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "invalid_request_error",
                  message: updateResult.error.message,
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
