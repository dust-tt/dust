import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  getAgentEditorGroup,
  updateAgentPermissions,
} from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type {
  LightAgentConfigurationType,
  UserType,
  WithAPIErrorResponse,
} from "@app/types";

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

  // TODO(FILOU): Implement canRead/canEdit checks based on new permission model (editors group + visible/hidden scope)
  // For now, assuming a basic check exists or will be added.
  const hasReadPermission = true; // Replace with actual check: await auth.canReadAgent(agent);
  const hasEditPermission = true; // Replace with actual check: await auth.canEditAgent(agent);

  if (!hasReadPermission) {
    return apiError(req, res, {
      status_code: 404, // Return 404 to avoid leaking existence of agent
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  const editorGroupRes = await getAgentEditorGroup(auth, agent.id);
  if (editorGroupRes.isErr()) {
    // Handle cases like group not found (might happen during creation race condition or deletion)
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
      const members = await editorGroup.getActiveMembers(auth);
      const memberUsers = members.map((m) => m.toJSON());

      return res.status(200).json({ editors: memberUsers });
    }

    case "PATCH": {
      if (!hasEditPermission) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "agent_configuration_auth_error",
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

      // Use validated body with defaults for potentially missing arrays
      const { addEditorIds = [], removeEditorIds = [] } = bodyValidation.right;

      // Fetch user resources for both lists
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

        // Check if any IDs were actually missing before returning error
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

      // Call the updated permission function
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
      const updatedMemberUsers = updatedMembers.map((m) => m.toJSON());

      // Use PatchAgentEditorsResponseBody type here
      return res.status(200).json({ editors: updatedMemberUsers });
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
