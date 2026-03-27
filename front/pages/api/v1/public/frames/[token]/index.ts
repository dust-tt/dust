import { getAuthForSharedEndpointWorkspaceMembersOnly } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { lookupShareToken } from "@app/lib/api/regions/lookup";
import {
  FRAME_SESSION_COOKIE_NAME,
  getFrameSessionEmail,
} from "@app/lib/api/share/frame_session";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getConversationRoute, getProjectRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isInteractiveContentType } from "@app/types/files";
import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get a frame by its public share token.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PublicFrameResponseBodyType>>
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  const { token } = req.query;
  if (typeof token !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token parameter.",
      },
    });
  }

  const result = await FileResource.fetchByShareToken(token);
  if (result.isErr()) {
    logger.warn(
      { token, errorCode: result.error.code, errorMessage: result.error.message },
      "Public frame fetch failed"
    );

    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const { file, shareScope, shareableFileId } = result.value;
  // TODO: Refactor FileResource.fetchByShareToken to return the WorkspaceResource directly to avoid this extra query.
  const workspace = await WorkspaceResource.fetchByModelId(file.workspaceId);
  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Only allow conversation Frame files.
  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame can be shared publicly.",
      },
    });
  }

  // Check if file is safe to display.
  if (!file.isSafeToDisplay()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not safe for public display.",
      },
    });
  }

  // If file is shared publicly, ensure workspace allows it.
  if (
    shareScope === "public" &&
    !workspace.canShareInteractiveContentPublicly
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const auth = await getAuthForSharedEndpointWorkspaceMembersOnly(
    req,
    res,
    workspace.sId
  );

  // Handle email-based share scopes (treat legacy "workspace" as "workspace_and_emails").
  if (
    shareScope === "emails_only" ||
    shareScope === "workspace_and_emails" ||
    shareScope === "workspace"
  ) {
    // For workspace_and_emails (and legacy "workspace"): workspace members are authorized directly.
    const isWorkspaceMemberWithAccess =
      (shareScope === "workspace_and_emails" || shareScope === "workspace") &&
      auth;

    if (!isWorkspaceMemberWithAccess) {
      // Resolve the verified email: prefer Dust session, fall back to external viewer cookie.
      let verifiedEmail: string | null = auth?.user()?.email ?? null;
      if (!verifiedEmail) {
        const sessionToken = req.cookies[FRAME_SESSION_COOKIE_NAME];
        if (sessionToken) {
          verifiedEmail = await getFrameSessionEmail(workspace, {
            token: sessionToken,
          });
        }
      }

      // Check if the verified email has an active grant for this frame.
      const hasGrant =
        verifiedEmail &&
        (await FileResource.getActiveGrantForEmail(workspace, {
          email: verifiedEmail,
          shareableFileId,
        }));

      if (!hasGrant) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "File not found.",
          },
        });
      }

      await FileResource.recordGrantView(workspace, {
        email: verifiedEmail!,
        shareableFileId,
      });
    }
  }

  const conversationId = file.useCaseMetadata?.conversationId;
  const user = auth && auth.user();
  const conversation =
    conversationId && auth
      ? await ConversationResource.fetchById(auth, conversationId)
      : null;

  const isParticipant =
    user && conversation && auth
      ? await ConversationResource.isConversationParticipant(auth, {
          conversation: conversation.toJSON(),
          user: user.toJSON(),
        })
      : false;

  const spaceId = file.useCaseMetadata?.spaceId;
  const space =
    spaceId && auth ? await SpaceResource.fetchById(auth, spaceId) : null;
  const canRead = space && space.isProject() && auth && space.canRead(auth);

  // Generate access token for viz rendering.
  const accessToken = generateVizAccessToken({
    contentType: file.contentType,
    fileToken: token,
    userId: user?.sId,
    shareScope,
    workspaceId: workspace.sId,
  });

  res.status(200).json({
    accessToken,
    file: file.toJSON(),
    // Only return the conversation URL if the user is a participant of the conversation.
    conversationUrl: isParticipant
      ? getConversationRoute(
          workspace.sId,
          conversationId,
          undefined,
          config.getAppUrl()
        )
      : null,
    // Only return the project URL if the user can read the project.
    projectUrl:
      canRead && spaceId ? getProjectRoute(workspace.sId, spaceId) : null,
  });
}

export default withLogging(handler);
