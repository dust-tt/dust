import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import { notifyPublishedFrameSidePanel } from "@app/lib/api/frames/notify_published_frame";
import { recordFramePublishAction } from "@app/lib/api/frames/publish_billing";
import { publishFrameFromSource } from "@app/lib/api/frames/publish_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import type { EgressDomainRequestsSummary } from "@app/lib/api/sandbox/egress_domain_requests";
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
  egressDomains?: EgressDomainRequestsSummary;
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
/**
 * @cc [owner:davidebbo,label:product] publish-records-billing-action
 * Every successful publish MUST call `recordFramePublishAction` with the exec token's `actionId`
 * before responding, so the agent message is charged for it. A recording failure returned as an
 * `Err` MUST be logged and MUST NOT change the publish response. Thrown errors propagate, per
 * `no-catching-own-errors`.
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

    // The Frame is already published: failing to record its charge must not fail the request.
    const recorded = await recordFramePublishAction(auth, {
      conversation,
      parentActionId: claims.actionId,
      publication: publication.value,
    });
    if (recorded.isErr()) {
      logger.error(
        {
          err: recorded.error,
          actionId: claims.actionId,
          conversationId: claims.cId,
          frameId: publication.value.frameId,
        },
        "Failed to record Frame publish billing action."
      );
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
            ...(publication.value.egressDomains
              ? { egressDomains: publication.value.egressDomains }
              : {}),
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
