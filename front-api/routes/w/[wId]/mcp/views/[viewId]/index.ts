import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  updateNameAndDescriptionForMCPServerViews,
  updateOAuthUseCaseForMCPServerViews,
} from "@app/lib/api/mcp/views";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsUser } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

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

const ParamsSchema = z.object({
  viewId: z.string(),
});

// Mounted at /api/w/:wId/mcp/views/:viewId.
const app = workspaceApp();

app.patch(
  "/",
  validate("param", ParamsSchema),
  ensureIsUser(),
  validate("json", PatchMCPServerViewBodySchema),
  async (ctx): HandlerResult<PatchMCPServerViewResponseBody> => {
    const auth = ctx.get("auth");

    const { viewId } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    // Get the system view to validate that viewId refers to a system view.
    const systemView = await MCPServerViewResource.fetchById(auth, viewId);

    if (!systemView) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "mcp_server_view_not_found",
          message: "MCP Server View not found",
        },
      });
    }

    if (systemView.space.kind !== "system") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Updates can only be performed on system views.",
        },
      });
    }

    const mcpServerId = systemView.mcpServerId;

    if ("oAuthUseCase" in body) {
      const updateResult = await updateOAuthUseCaseForMCPServerViews(auth, {
        mcpServerId,
        oAuthUseCase: body.oAuthUseCase,
      });

      if (updateResult.isErr()) {
        return respondToUpdateError(ctx, updateResult.error.code);
      }
    } else if ("name" in body && "description" in body) {
      const updateResult = await updateNameAndDescriptionForMCPServerViews(
        auth,
        {
          mcpServerId,
          name: body.name ?? undefined,
          description: body.description ?? undefined,
        }
      );

      if (updateResult.isErr()) {
        if (updateResult.error.code === "name_conflict") {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateResult.error.message,
            },
          });
        }
        return respondToUpdateError(ctx, updateResult.error.code);
      }
    }

    const updatedSystemView = await MCPServerViewResource.fetchById(
      auth,
      viewId
    );

    if (!updatedSystemView) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "mcp_server_view_not_found",
          message: "MCP Server View not found after update",
        },
      });
    }

    return ctx.json({
      success: true as const,
      serverView: updatedSystemView.toJSON(),
    });
  }
);

function respondToUpdateError(
  ctx: Context,
  code: "unauthorized" | "mcp_server_view_not_found"
) {
  switch (code) {
    case "unauthorized":
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "workspace_auth_error",
          message: "You are not authorized to update the MCP server view.",
        },
      });
    case "mcp_server_view_not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "mcp_server_view_not_found",
          message: "Could not find the associated MCP server views.",
        },
      });
    default:
      return assertNever(code);
  }
}

export default app;
