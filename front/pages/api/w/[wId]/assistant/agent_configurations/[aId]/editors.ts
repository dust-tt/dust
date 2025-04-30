import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  updateAgentPermissions,
} from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { UserType, WithAPIErrorResponse } from "@app/types";

// Changed schema to accept optional add/remove lists
export const PatchAgentEditorsRequestBodySchema = t.intersection([
  t.type({}), // Ensures it's an object
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

  const agent = await getAgentConfiguration(
    auth,
    agentConfigurationId,
    "light"
  );
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
    // Handle cases like group not found or auth errors from fetchById
    if (
      editorGroupRes.error instanceof DustError &&
      (editorGroupRes.error.code === "resource_not_found" ||
        editorGroupRes.error.code === "unauthorized")
    ) {
      // Return 404 for not found or unauthorized to find the group
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found", // Keep error generic
          message: "The agent configuration editor group was not found.",
        },
      });
    }
    // Generic internal error for other cases
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve editor group: ${editorGroupRes.error.message}`,
      },
    });
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
        // Handle specific errors from updateAgentPermissions/setMembers if needed
        if (
          updateRes.error instanceof DustError &&
          // Add specific error checks from addMembers/removeMembers if needed
          (updateRes.error.code === "user_not_member" ||
            updateRes.error.code === "user_already_member")
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateRes.error.message,
            },
          });
        }
        // Generic error
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to update agent editors: ${updateRes.error.message}`,
          },
        });
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
