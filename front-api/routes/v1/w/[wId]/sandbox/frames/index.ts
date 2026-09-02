import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import { publishFrameFromSource } from "@app/lib/api/frames/publish_from_source";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import call from "./call";
import callById from "./call_by_id";
import { frameSourceErrorStatus } from "./errors";
import register from "./register";
import share from "./share";
import validateFrame from "./validate";

const FramePublishRequestSchema = z.object({
  manifestPath: z.string().min(1),
});

type FramePublishResponse = {
  frameId: string;
  manifestPath: string;
  publicationId?: string;
  warnings?: ValidationWarning[];
};

// Mounted at /api/v1/w/:wId/sandbox/frames.
const app = sandboxApp();

app.use("*", sandboxAuth({ allowedTokenKinds: ["action"] }));
app.route("/call", call);
app.route("/:frameId/call", callById);
app.route("/register", register);
app.route("/share", share);
app.route("/validate", validateFrame);

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
    const { manifestPath } = ctx.req.valid("json");
    const publication = await publishFrameFromSource(auth, {
      conversation: conversation.toJSON(),
      publishedByAgentConfigurationId: claims.aId,
      sourcePath: manifestPath,
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
          },
          200
        );
      default:
        return assertNever(publication.value);
    }
  }
);

export default app;
