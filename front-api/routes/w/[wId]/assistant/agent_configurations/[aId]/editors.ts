import {
  getAgentConfiguration,
  updateAgentPermissions,
} from "@app/lib/api/assistant/configuration/agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PatchAgentEditorsRequestBodySchema = z
  .object({
    addEditorIds: z.array(z.string()).optional(),
    removeEditorIds: z.array(z.string()).optional(),
  })
  .refine(
    (body) =>
      (body.addEditorIds instanceof Array && body.addEditorIds.length > 0) ||
      (body.removeEditorIds instanceof Array &&
        body.removeEditorIds.length > 0),
    {
      message:
        "Either addEditorIds or removeEditorIds must be provided and contain at least one ID.",
    }
  );

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/editors.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";

  const agent = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agent) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  const editorGroupRes = await GroupResource.findEditorGroupForAgent(
    auth,
    agent
  );
  if (editorGroupRes.isErr()) {
    switch (editorGroupRes.error.code) {
      case "unauthorized":
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: "workspace_auth_error",
            message: "You are not authorized to update the agent editors.",
          },
        });
      case "invalid_id":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Some of the passed ids are invalid.",
          },
        });
      case "group_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "group_not_found",
            message: "Unable to find the editor group for the agent.",
          },
        });
      case "internal_error":
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: editorGroupRes.error.message,
          },
        });
      default:
        assertNever(editorGroupRes.error.code);
    }
  }

  const editorGroup = editorGroupRes.value;
  if (!editorGroup.canRead(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "agent_group_permission_error",
        message: "User is not authorized to read the agent editors.",
      },
    });
  }

  const members = await editorGroup.getActiveMembers(auth);
  return ctx.json({ editors: members.map((m) => m.toJSON()) });
});

app.patch(
  "/",
  validate("json", PatchAgentEditorsRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const aId = ctx.req.param("aId") ?? "";

    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    const editorGroupRes = await GroupResource.findEditorGroupForAgent(
      auth,
      agent
    );
    if (editorGroupRes.isErr()) {
      switch (editorGroupRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: "You are not authorized to update the agent editors.",
            },
          });
        case "invalid_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Some of the passed ids are invalid.",
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: "Unable to find the editor group for the agent.",
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: editorGroupRes.error.message,
            },
          });
        default:
          assertNever(editorGroupRes.error.code);
      }
    }

    const editorGroup = editorGroupRes.value;
    if (!editorGroup.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message:
            "Only editors of the agent or workspace admins can modify editors.",
        },
      });
    }

    const { addEditorIds = [], removeEditorIds = [] } = ctx.req.valid("json");

    const usersToAdd = await UserResource.fetchByIds(addEditorIds);
    const usersToRemove = await UserResource.fetchByIds(removeEditorIds);

    if (
      usersToAdd.length !== addEditorIds.length ||
      usersToRemove.length !== removeEditorIds.length
    ) {
      const foundAddIds = new Set(usersToAdd.map((u) => u.sId));
      const missingAddIds = addEditorIds.filter((id) => !foundAddIds.has(id));
      const foundRemoveIds = new Set(usersToRemove.map((u) => u.sId));
      const missingRemoveIds = removeEditorIds.filter(
        (id) => !foundRemoveIds.has(id)
      );
      const missingIds = [...missingAddIds, ...missingRemoveIds];

      if (missingIds.length > 0) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message: `Some users were not found: ${missingIds.join(", ")}`,
          },
        });
      }
    }

    const updateRes = await updateAgentPermissions(auth, {
      agent,
      usersToAdd: usersToAdd.map((u) => u.toJSON()),
      usersToRemove: usersToRemove.map((u) => u.toJSON()),
    });

    if (updateRes.isErr()) {
      switch (updateRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: "You are not authorized to update the agent editors.",
            },
          });
        case "invalid_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Some of the passed ids are invalid.",
            },
          });
        case "group_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "group_not_found",
              message: "Unable to find the editor group for the agent.",
            },
          });
        case "user_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "user_not_found",
              message: "The user was not found in the workspace.",
            },
          });
        case "user_not_member":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message: "The user is not a member of the agent editors group.",
            },
          });
        case "group_requirements_not_met":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Some users have insufficient role privilege to be added to agent editors.",
            },
          });
        case "system_or_global_group":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: "Users cannot be removed from system or global groups.",
            },
          });
        case "user_already_member":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message:
                "The user is already a member of the agent editors group.",
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: updateRes.error.message,
            },
          });
        default:
          assertNever(updateRes.error.code);
      }
    }

    const updatedMembers = await editorGroup.getActiveMembers(auth);
    return ctx.json({ editors: updatedMembers.map((m) => m.toJSON()) });
  }
);

export default app;
