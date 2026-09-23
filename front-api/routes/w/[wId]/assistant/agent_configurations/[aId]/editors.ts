import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  getAgentEditors,
  updateAgentEditorsFromDelta,
} from "@app/lib/api/assistant/editors";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentEditorsLightResponseBody,
  AgentEditorsResponseBody,
} from "@app/types/api/assistant/configuration/editors";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { toLightUser } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import {
  ARCHIVED_AGENT_API_ERROR,
  isArchivedAgent,
} from "@front-api/routes/w/[wId]/assistant/agent_configurations/guards";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

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
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (
    ctx
  ): HandlerResult<
    AgentEditorsResponseBody | AgentEditorsLightResponseBody
  > => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    // Admins can see and manage the editors of every agent of the workspace, including the ones
    // built on spaces they are not a member of.
    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
      dangerouslySkipPermissionFiltering: auth.isAdmin(),
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

    const editorsResult = await getAgentEditors(auth, agent);
    if (editorsResult.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Unable to find the editor group for the agent.",
        },
      });
    }

    // Any workspace member can read the editors of an agent.
    const memberUsers = editorsResult.value.map((member) => member.toJSON());

    // biome-ignore lint/plugin/noDirectRoleCheck: non-admins receive only minimal essential user data (LightUserType)
    if (auth.isAdmin()) {
      return ctx.json({ editors: memberUsers });
    }

    return ctx.json({
      editors: memberUsers.map(toLightUser),
    });
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchAgentEditorsRequestBodySchema),
  async (
    ctx
  ): HandlerResult<
    AgentEditorsResponseBody | AgentEditorsLightResponseBody
  > => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    // Admins can see and manage the editors of every agent of the workspace, including the ones
    // built on spaces they are not a member of.
    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
      dangerouslySkipPermissionFiltering: auth.isAdmin(),
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

    // Global agents have no editor grant. Preserve the existing 404 response without consulting
    // the legacy editor-group association.
    if (agent.scope === "global") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Unable to find the editor group for the agent.",
        },
      });
    }

    // A caller who cannot fetch the agent as a resource (no verb on it) cannot administrate it: the
    // agent's existence was already confirmed above via `getAgentConfiguration`, so treat a missing
    // resource as "not administrable" (403) rather than "not found" (404).
    const agentResource = await AgentResource.fetchById(auth, aId);
    const canAdministrate =
      agentResource !== null && auth.can("admin", agentResource);
    if (!canAdministrate) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message:
            "Only editors of the agent or workspace admins can modify editors.",
        },
      });
    }

    if (isArchivedAgent(agent)) {
      return apiError(ctx, ARCHIVED_AGENT_API_ERROR);
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

    const updateRes = await updateAgentEditorsFromDelta(auth, agent, {
      usersToAdd,
      usersToRemove,
    });

    if (updateRes.isErr()) {
      switch (updateRes.error.code) {
        case "user_already_member":
        case "user_not_member":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message: updateRes.error.message,
            },
          });
        case "user_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "user_not_found",
              message: updateRes.error.message,
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

    const updatedMembers = await getAgentEditors(auth, agent);
    if (updatedMembers.isErr()) {
      throw updatedMembers.error;
    }
    const updatedEditors = updatedMembers.value.map((m) => m.toJSON());

    // biome-ignore lint/plugin/noDirectRoleCheck: non-admins receive only minimal essential user data (LightUserType)
    if (auth.isAdmin()) {
      return ctx.json({ editors: updatedEditors });
    }

    return ctx.json({
      editors: updatedEditors.map(toLightUser),
    });
  }
);

export default app;
