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
import { ARCHIVED_AGENT_API_ERROR } from "@front-api/routes/w/[wId]/assistant/agent_configurations/guards";
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

    // Fetch the resource directly. Admins hold the agent `admin` verb (so `fetchById` returns hidden
    // agents built on spaces they are not a member of); other members get it only when they can read
    // it.
    const agentResource = await AgentResource.fetchById(auth, aId);
    if (!agentResource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    // Global agents have no editor grant.
    const editors =
      agentResource.scope === "global"
        ? null
        : await agentResource.listEditors(auth);
    if (!editors) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Unable to find the editor group for the agent.",
        },
      });
    }

    // Any workspace member can read the editors of an agent.
    const memberUsers = editors.map((member) => member.toJSON());

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

    // Fetch the resource directly. Admins hold the agent `admin` verb (so `fetchById` returns hidden
    // agents on spaces they are not a member of); a caller without a verb on it gets a 404.
    const agentResource = await AgentResource.fetchById(auth, aId);
    if (!agentResource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    // Global agents have no editor grant.
    if (agentResource.scope === "global") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Unable to find the editor group for the agent.",
        },
      });
    }

    if (!auth.can("admin", agentResource)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message:
            "Only editors of the agent or workspace admins can modify editors.",
        },
      });
    }

    if (agentResource.status === "archived") {
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

    const updateRes = await agentResource.updateEditorsFromDelta(auth, {
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

    const updatedMembers = (await updateRes.value.listEditors(auth)) ?? [];
    const updatedEditors = updatedMembers.map((m) => m.toJSON());

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
