import type { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  getAgentConfigurationEditorGroup,
  updatePermissions,
} from "@app/lib/api/assistant/configuration";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { UserType, WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<AgentConfigurationEditorGetResponseBody>
  >
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    // Assuming apiError handles APIErrorResponse type
    return apiError(req, res, keyRes.error);
  }

  // Correctly destructure the Authenticator result
  const { workspaceAuth: auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string // Use wId here
  );

  if (!auth) {
    // Handle case where workspaceAuth might be null/undefined if key is workspace-less
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "Authenticator failed to initialize.",
      },
    });
  }

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  const agentId = req.query.aId as string;
  if (!agentId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Agent ID (aId) is required.",
      },
    });
  }

  // Fetch the underlying AgentConfiguration model instance for internal logic
  const agentModel = await AgentConfiguration.findOne({
    where: {
      sId: agentId,
      workspaceId: owner.id,
    },
    order: [["version", "DESC"]],
  });

  if (!agentModel) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "Agent configuration not found.",
      },
    });
  }

  // Fetch the AgentConfigurationType for permission checks
  const agentConfigType = await getAgentConfiguration(auth, agentId, "full");
  if (!agentConfigType) {
    // This should not happen if agentModel was found, but check for safety
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "Agent configuration not found.",
      },
    });
  }

  const editorGroupRes = await getAgentConfigurationEditorGroup(
    auth,
    agentModel
  );
  if (editorGroupRes.isErr()) {
    console.error(
      `[API Error] Failed to get editor group for agent ${agentModel.sId}: ${editorGroupRes.error.message}`
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to retrieve agent editors.",
      },
    });
  }
  const editorGroup = editorGroupRes.value;

  // Permission Check: Only editors or workspace admins can view/edit editors
  const currentUser = auth.user();
  let canEdit = auth.isAdmin();
  if (!canEdit && currentUser) {
    const members = await editorGroup.getActiveMembers(auth);
    canEdit = members.some((m) => m.id === currentUser.id);
  }

  if (!canEdit) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "You do not have permission to view or edit this agent's editors.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const members = await editorGroup.getActiveMembers(auth);
      const memberUsers = await UserResource.fetchByIds(
        members.map((m) => m.sId)
      );

      res.status(200).json({
        editors: memberUsers.map((u) => u.toJSON()), // Return full UserType
      });
      return;

    case "PATCH":
      const body = req.body as AgentConfigurationEditorPatchRequestBody;
      if (!body || !Array.isArray(body.memberIds)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body. Expecting { memberIds: string[] }.",
          },
        });
      }

      const updateRes = await updatePermissions(
        auth,
        agentModel, // Pass the model instance
        body.memberIds
      );

      if (updateRes.isErr()) {
        const isUserNotFound = updateRes.error.message.includes("not found");
        console.error(
          `[API Error] Failed to update permissions for agent ${agentModel.sId}: ${updateRes.error.message}`
        );
        return apiError(req, res, {
          status_code: isUserNotFound ? 400 : 500,
          api_error: {
            type: isUserNotFound ? "user_not_found" : "internal_server_error",
            message: `Failed to update agent editors: ${updateRes.error.message}`,
          },
        });
      }

      // Fetch updated members to return
      const updatedMembers = await editorGroup.getActiveMembers(auth);
      const updatedMemberUsers = await UserResource.fetchByIds(
        updatedMembers.map((m) => m.sId)
      );

      res.status(200).json({
        editors: updatedMemberUsers.map((u) => u.toJSON()), // Return full UserType
      });
      return;

    default:
      res.setHeader("Allow", ["GET", "PATCH"]);
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not allowed.",
        },
      });
  }
}

export default withLogging(handler);

// Define response/request body types
export type AgentConfigurationEditorGetResponseBody = {
  editors: UserType[];
};

export type AgentConfigurationEditorPatchRequestBody = {
  memberIds: string[];
};
