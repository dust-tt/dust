import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
import { removeAgentEditor } from "@app/lib/api/assistant/configuration";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse, UserType } from "@app/types";
import { GroupResource } from "@app/lib/resources/group_resource";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { UserResource } from "@app/lib/resources/user_resource";

export type AgentConfigurationEditorDeleteResponseBody = {
  editors: UserType[]; // Return the updated list
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<AgentConfigurationEditorDeleteResponseBody>
  >,
  auth: Authenticator // Injected by withSessionAuthenticationForWorkspace
): Promise<void> {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Method not allowed. Allowed method: DELETE.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  const agentId = req.query.aId as string;
  const editorToRemoveId = req.query.eId as string; // Get editor ID from route

  if (!agentId || !editorToRemoveId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Agent ID (aId) and Editor ID (eId) are required.",
      },
    });
  }

  // Fetch the underlying AgentConfiguration model instance
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

  // Fetch the editor group
  const editorGroupRes =
    await GroupResource.fetchEditorGroupForAgentConfiguration(auth, agentModel);
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

  // Permission Check
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
          "You do not have permission to remove editors from this agent.",
      },
    });
  }

  // Perform the removal
  const removeRes = await removeAgentEditor(auth, agentModel, editorToRemoveId);

  if (removeRes.isErr()) {
    const isUserNotFound = removeRes.error.message.includes("not found");
    const isNotMember = removeRes.error.message.includes("not member");
    console.error(
      `[API Error] Failed to remove editor ${editorToRemoveId} for agent ${agentModel.sId}: ${removeRes.error.message}`
    );
    return apiError(req, res, {
      status_code: isUserNotFound || isNotMember ? 400 : 500,
      api_error: {
        type: isUserNotFound
          ? "user_not_found"
          : isNotMember
            ? "invalid_request_error"
            : "internal_server_error",
        message: `Failed to remove agent editor: ${removeRes.error.message}`,
      },
    });
  }

  // Fetch updated members to return
  const updatedMembers = await editorGroup.getActiveMembers(auth);
  const updatedMemberUsers = await UserResource.fetchByIds(
    updatedMembers.map((m) => m.sId)
  );

  res.status(200).json({
    editors: updatedMemberUsers.map((u) => u.toJSON()),
  });
}

export default withSessionAuthenticationForWorkspace(handler);
