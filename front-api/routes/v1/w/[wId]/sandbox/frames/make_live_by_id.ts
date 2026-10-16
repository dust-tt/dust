import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { attachPublishedFrameToParentAction } from "@app/lib/api/frames/attach_published_frame";
import { makeFrameDraftLive } from "@app/lib/api/frames/make_live";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { frameMakeLiveApiError } from "@front-api/lib/api/frame_make_live_errors";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameMakeLiveParamsSchema = z.object({
  frameId: z.string().refine((value) => isResourceSId("file", value)),
});

const FrameMakeLiveRequestSchema = z.object({
  // The draft publication id returned by the agent's draft publish.
  publicationId: z.string().min(1),
});

type FrameMakeLiveResponse = {
  frameId: string;
  publicationId: string;
  status: "live";
};

const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
/**
 * @cc [owner:davidebbo,label:security;api] make-live-scoped-to-token-conversation
 * The route MUST refuse with 403 `frame_not_in_conversation`, before making anything live or
 * attaching anything to the parent action, a Frame the exec token's conversation file system
 * (its conversation plus its Pod) cannot write, even when the user can write that Frame elsewhere.
 */
app.post(
  "/",
  validate("param", FrameMakeLiveParamsSchema),
  validate("json", FrameMakeLiveRequestSchema),
  async (ctx): HandlerResult<FrameMakeLiveResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "sandbox_token_not_allowed",
          message: "This sandbox token cannot make Frames live.",
        },
      });
    }
    if (!(await hasFeatureFlag(auth, "frames_v2"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_not_enabled",
          message: "Frames v2 is not enabled for this workspace.",
        },
      });
    }

    const conversation = await ConversationResource.fetchById(auth, claims.cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: `Conversation ${claims.cId} not found.`,
        },
      });
    }

    const { frameId } = ctx.req.valid("param");
    const { publicationId } = ctx.req.valid("json");

    const frame = await FileResource.fetchById(auth, frameId);
    if (!frame?.isFrameV2) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Frame not found." },
      });
    }

    // The token may only act on its own conversation's files (and its Pod's), as /publish does:
    // write access to the Frame elsewhere is not enough.
    const fsResult = await DustFileSystem.forConversation(
      auth,
      conversation.toJSON()
    );
    if (fsResult.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: fsResult.error.message,
          },
        },
        fsResult.error
      );
    }
    const scopedPath = frame.toScopedPath(auth);
    if (!scopedPath || fsResult.value.checkWriteAccess(scopedPath).isErr()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "frame_not_in_conversation",
          message: "This Frame is not in this conversation's files.",
        },
      });
    }

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: publicationId,
      publishedByAgentConfigurationId: claims.aId,
    });
    if (result.isErr()) {
      return apiError(ctx, frameMakeLiveApiError(result.error), result.error);
    }

    // Refresh the Frame card on the parent action so the panel's draft chip goes away.
    // Best-effort: the Frame is already live.
    const attached = await attachPublishedFrameToParentAction(auth, {
      actionId: claims.actionId,
      frameId: frame.sId,
    });
    if (attached.isErr()) {
      logger.warn(
        {
          err: attached.error,
          actionId: claims.actionId,
          conversationId: claims.cId,
          messageId: claims.mId,
          frameId: frame.sId,
        },
        "Failed to attach made-live Frame to parent action generated files."
      );
    }

    return ctx.json(
      {
        frameId: frame.sId,
        publicationId: result.value.publicationId,
        status: "live" as const,
      },
      200
    );
  }
);

export default app;
