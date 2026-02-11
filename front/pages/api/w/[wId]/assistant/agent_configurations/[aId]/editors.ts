import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  updateAgentPermissions,
} from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { UserType } from "@app/types/user";

// Changed schema to accept optional add/remove lists
export const PatchAgentEditorsRequestBodySchema = t.intersection([
  t.type({}),
  t.partial({
    addEditorIds: t.array(t.string),
    removeEditorIds: t.array(t.string),
  }),
  // Refinement to ensure at least one of the arrays exists and is not empty
  t.refinement(
    t.type({
      // Use t.type inside refinement for better type checking
      addEditorIds: t.union([t.array(t.string), t.undefined]),
      removeEditorIds: t.union([t.array(t.string), t.undefined]),
    }),
    (body) =>
      (body.addEditorIds instanceof Array && body.addEditorIds.length > 0) ||
      (body.removeEditorIds instanceof Array &&
        body.removeEditorIds.length > 0),
    "Either addEditorIds or removeEditorIds must be provided and contain at least one ID."
  ),
]);
export type PatchAgentEditorsRequestBody = t.TypeOf<
  typeof PatchAgentEditorsRequestBodySchema
>;

export interface GetAgentEditorsResponseBody {
  editors: UserType[];
}

export interface PatchAgentEditorsResponseBody {
  editors: UserType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetAgentEditorsResponseBody | PatchAgentEditorsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const agentConfigurationId = req.query.aId as string;

  const agent = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });
  if (!agent) {
    return apiError(req, res, {
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
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "workspace_auth_error",
            message: "You are not authorized to update the agent editors.",
          },
        });
      case "invalid_id":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Some of the passed ids are invalid.",
          },
        });
      case "group_not_found":
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "group_not_found",
            message: "Unable to find the editor group for the agent.",
          },
        });
      case "internal_error":
        return apiError(req, res, {
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

  switch (req.method) {
    case "GET": {
      if (!editorGroup.canRead(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "agent_group_permission_error",
            message: "User is not authorized to read the agent editors.",
          },
        });
      }

      const members = await editorGroup.getActiveMembers(auth);
      const memberUsers = members.map((m) => m.toJSON());

      return res.status(200).json({ editors: memberUsers });
    }

    case "PATCH": {
      if (!editorGroup.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "agent_group_permission_error",
            message:
              "Only editors of the agent or workspace admins can modify editors.",
          },
        });
      }

      const bodyValidation = PatchAgentEditorsRequestBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { addEditorIds = [], removeEditorIds = [] } = bodyValidation.right;

      const usersToAdd = await UserResource.fetchByIds(addEditorIds);
      const usersToRemove = await UserResource.fetchByIds(removeEditorIds);

      // Validate fetched users match requested IDs
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
          return apiError(req, res, {
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
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message: "You are not authorized to update the agent editors.",
              },
            });
          case "invalid_id":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "Some of the passed ids are invalid.",
              },
            });
          case "group_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "group_not_found",
                message: "Unable to find the editor group for the agent.",
              },
            });
          case "user_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "user_not_found",
                message: "The user was not found in the workspace.",
              },
            });
          case "user_not_member":
            return apiError(req, res, {
              status_code: 409,
              api_error: {
                type: "invalid_request_error",
                message: "The user is not a member of the agent editors group.",
              },
            });
          case "group_requirements_not_met":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "Some users have insufficient role privilege to be added to agent editors.",
              },
            });
          case "system_or_global_group":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "Users cannot be removed from system or global groups.",
              },
            });
          case "user_already_member":
            return apiError(req, res, {
              status_code: 409,
              api_error: {
                type: "invalid_request_error",
                message:
                  "The user is already a member of the agent editors group.",
              },
            });
          case "internal_error":
            return apiError(req, res, {
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

      // Refetch members to return the updated list
      const updatedMembers = await editorGroup.getActiveMembers(auth);

      return res.status(200).json({
        editors: updatedMembers.map((m) => m.toJSON()),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
