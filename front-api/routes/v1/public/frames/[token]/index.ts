import config from "@app/lib/api/config";
import {
  FRAME_SESSION_COOKIE_NAME,
  getFrameSessionEmail,
} from "@app/lib/api/share/frame_session";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getConversationRoute, getPodRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { isInteractiveContentType } from "@app/types/files";
import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import { unauthedApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { resolveOptionalAuth } from "@front-api/routes/v1/public/frames/shared_auth";
import { getCookie } from "hono/cookie";

import verifyCode from "./verify-code";
import verifyEmail from "./verify-email";

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get a frame by its public share token.
 */

// Mounted at /api/v1/public/frames/:token.
const app = unauthedApp();

app.get("/", async (ctx): HandlerResult<PublicFrameResponseBodyType> => {
  const token = ctx.req.param("token");
  if (!token) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token parameter.",
      },
    });
  }

  const result = await FileResource.fetchByShareToken(token);
  if (result.isErr()) {
    logger.info(
      {
        token,
        errorCode: result.error.code,
        errorMessage: result.error.message,
      },
      "Public frame fetch failed"
    );

    return apiError(ctx, {
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
    return apiError(ctx, {
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
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame can be shared publicly.",
      },
    });
  }

  // Check if file is safe to display.
  if (!file.isSafeToDisplay()) {
    return apiError(ctx, {
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
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const auth = await resolveOptionalAuth(ctx, workspace.sId);

  // If workspace policy restricts to members only, block all non-member access.
  if (workspace.sharingPolicy === "workspace_only" && !auth) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Handle email-based share scopes (treat legacy "workspace" as "workspace_and_emails").
  if (
    shareScope === "emails_only" ||
    shareScope === "workspace_and_emails" ||
    shareScope === "workspace"
  ) {
    // The file's creator always has access to their own frame, regardless of share scope or grant
    // list. Without this bypass, an owner viewing their own `emails_only` frame would be sent
    // through the OTP flow even though they are logged in as the file's creator.
    const authUserModelId = auth?.user()?.id ?? null;
    const isFileOwner =
      authUserModelId !== null && file.userId === authUserModelId;

    // For workspace_and_emails (and legacy "workspace"): workspace members are authorized directly.
    const isWorkspaceMemberWithAccess =
      (shareScope === "workspace_and_emails" || shareScope === "workspace") &&
      auth;

    if (!isFileOwner && !isWorkspaceMemberWithAccess) {
      // Resolve the verified email: prefer Dust session, fall back to external viewer cookie.
      let verifiedEmail: string | null = auth?.user()?.email ?? null;
      if (!verifiedEmail) {
        const sessionToken = getCookie(ctx, FRAME_SESSION_COOKIE_NAME);
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
        return apiError(ctx, {
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

  return ctx.json({
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
    projectUrl: canRead && spaceId ? getPodRoute(workspace.sId, spaceId) : null,
  });
});

app.route("/verify-code", verifyCode);
app.route("/verify-email", verifyEmail);

export default app;
