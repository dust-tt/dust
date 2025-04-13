import type { NextApiRequest, NextApiResponse } from "next";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import { Authenticator } from "@app/lib/auth";
import { addAgentEditor } from "@app/lib/api/assistant/configuration";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { Result, UserType, WithAPIErrorResponse } from "@app/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";

// Define request/response types
const AddEditorRequestBodySchema = t.type({
  userId: t.string,
});

export type AgentConfigurationEditorGetResponseBody = {
  editors: UserType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<AgentConfigurationEditorGetResponseBody>
  >,
  auth: Authenticator // Injected by withSessionAuthenticationForWorkspace
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

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

  // Fetch the editor group using the GroupResource static method
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

    case "POST": // Use POST to add an editor
      const bodyValidation = AddEditorRequestBodySchema.decode(req.body);
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

      const { userId } = bodyValidation.right;

      const addRes = await addAgentEditor(auth, agentModel, userId);

      if (addRes.isErr()) {
        const isUserNotFound = addRes.error.message.includes("not found");
        const isAlreadyMember = addRes.error.message.includes("already member");
        console.error(
          `[API Error] Failed to add editor ${userId} for agent ${agentModel.sId}: ${addRes.error.message}`
        );
        return apiError(req, res, {
          status_code: isUserNotFound || isAlreadyMember ? 400 : 500,
          api_error: {
            type: isUserNotFound
              ? "user_not_found"
              : isAlreadyMember
                ? "invalid_request_error"
                : "internal_server_error",
            message: `Failed to add agent editor: ${addRes.error.message}`,
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
      res.setHeader("Allow", ["GET", "POST"]); // Allow GET and POST
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not allowed. Allowed methods: GET, POST.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
