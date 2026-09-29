import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import { notifyPublishedFrameSidePanel } from "@app/lib/api/frames/notify_published_frame";
import { publishFrameFromSource } from "@app/lib/api/frames/publish_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { frameSourceErrorStatus } from "@front-api/lib/api/frame_source_errors";
import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import frameById from "./[frameId]";
import call from "./call";
import callById from "./call_by_id";
import share from "./share";

const FramePublishRequestSchema = z.object({
  manifestPath: z.string().min(1),
  replacesPath: z.string().min(1).optional(),
});

type FramePublishResponse = {
  frameId: string;
  manifestPath: string;
  publicationId?: string;
  created?: boolean;
  warnings?: ValidationWarning[];
};

// Mounted at /api/v1/w/:wId/sandbox/frames.
const app = sandboxApp();

app.use("*", sandboxAuth({ allowedTokenKinds: ["action"] }));
app.route("/call", call);
app.route("/:frameId/call", callById);
app.route("/share", share);

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/publish",
  validate("json", FramePublishRequestSchema),
  async (ctx): HandlerResult<FramePublishResponse> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot publish Frames.",
        },
      });
    }
    if (!(await hasFeatureFlag(auth, "frames_v2"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
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

    // Keep the request field name for compatibility. Legacy Frames pass their entry source path.
    const { manifestPath, replacesPath } = ctx.req.valid("json");
    const publication = await publishFrameFromSource(auth, {
      conversation: conversation.toJSON(),
      publishedByAgentConfigurationId: claims.aId,
      sourcePath: manifestPath,
      replacesPath,
    });
    if (publication.isErr()) {
      const status = frameSourceErrorStatus(publication.error);
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type:
            status === 500 ? "internal_server_error" : "invalid_request_error",
          message: publication.error.message,
        },
      });
    }

    // Soft-open the Frame panel (refresh if already open; don't steal file explorer).
    // Best-effort — publish response must not wait on Redis / missing parent action.
    void notifyPublishedFrameSidePanel(auth, {
      actionId: claims.actionId,
      configurationId: claims.aId,
      conversationId: claims.cId,
      frameId: publication.value.frameId,
      messageId: claims.mId,
      contentRevision:
        publication.value.kind === "v2"
          ? publication.value.publicationId
          : undefined,
    }).catch((err) => {
      logger.warn(
        {
          err,
          actionId: claims.actionId,
          conversationId: claims.cId,
          messageId: claims.mId,
          frameId: publication.value.frameId,
        },
        "Failed to emit Frame publish side-panel notification."
      );
    });

    switch (publication.value.kind) {
      case "legacy":
        return ctx.json(
          {
            frameId: publication.value.frameId,
            manifestPath: publication.value.sourcePath,
            warnings: publication.value.warnings,
          },
          200
        );
      case "v2":
        return ctx.json(
          {
            frameId: publication.value.frameId,
            manifestPath: publication.value.sourcePath,
            publicationId: publication.value.publicationId,
            created: publication.value.created,
          },
          200
        );
      default:
        return assertNever(publication.value);
    }
  }
);

// A plain param, not a regex-constrained one: Hono's RegExpRouter cannot merge `/:frameId{...}`
// with the `/:frameId/call` sibling above and would silently downgrade the whole app to the trie
// router. The id shape is validated in the sub-app instead.
app.route("/:frameId", frameById);

export default app;
