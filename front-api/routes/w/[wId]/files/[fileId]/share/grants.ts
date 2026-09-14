import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { checkFrameEmailGrantPermission } from "@app/lib/api/share/frame_sharing";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import {
  isConversationFileUseCase,
  MAX_EMAILS_PER_INVITE,
} from "@app/types/files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const AddGrantsRequestBodySchema = z.object({
  emails: z.array(z.string().email()).min(1).max(MAX_EMAILS_PER_INVITE),
});

const RevokeGrantRequestBodySchema = z.object({
  grantId: z.number(),
});

const ParamsSchema = z.object({
  fileId: z.string(),
});

// Mounted at /api/w/:wId/files/:fileId/share/grants.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { fileId } = ctx.req.valid("param");

  const file = await fetchShareableFile(ctx, auth, fileId);
  if (file instanceof Response) {
    return file;
  }

  const grants = await file.listActiveSharingGrants();

  const workspace = auth.getNonNullableWorkspace();
  if (workspace.sharingPolicy === "workspace_only" && grants.length > 0) {
    const emails = grants.map((g) => g.email.toLowerCase());
    const users = await UserResource.fetchByEmails(emails);

    const userIdToEmail = new Map(
      users.map((u) => [u.id, u.email.toLowerCase()])
    );

    const { memberships } = await MembershipResource.getActiveMemberships({
      users,
      workspace,
    });

    const memberEmails = new Set(
      memberships.map((m) => userIdToEmail.get(m.userId)).filter(Boolean)
    );

    return ctx.json({
      grants: grants.map((g) => ({
        ...g,
        blockedByPolicy: !memberEmails.has(g.email.toLowerCase()),
      })),
    });
  }

  return ctx.json({ grants });
});

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", AddGrantsRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { fileId } = ctx.req.valid("param");

    const file = await fetchShareableFile(ctx, auth, fileId);
    if (file instanceof Response) {
      return file;
    }

    const { emails: rawEmails } = ctx.req.valid("json");

    const permission = await checkFrameEmailGrantPermission(auth, rawEmails);
    if (permission.isErr()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: permission.error.message,
        },
      });
    }

    const grants = await file.addSharingGrants(auth, { emails: rawEmails });

    void emitAuditLogEvent({
      auth,
      action: "frame.email_grant_added",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("frame", {
          sId: file.sId,
          name: file.fileName ?? file.sId,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        frame_name: file.fileName ?? file.sId,
        emails: rawEmails.join(","),
      },
    });

    return ctx.json({ grants });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  validate("json", RevokeGrantRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { fileId } = ctx.req.valid("param");

    const file = await fetchShareableFile(ctx, auth, fileId);
    if (file instanceof Response) {
      return file;
    }

    const { grantId } = ctx.req.valid("json");
    const result = await file.revokeSharingGrant({ grantId });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: result.error.message,
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "frame.email_grant_revoked",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("frame", {
          sId: file.sId,
          name: file.fileName ?? file.sId,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        frame_name: file.fileName ?? file.sId,
        email: result.value.email,
      },
    });

    return ctx.body(null, 204);
  }
);

async function fetchShareableFile(
  ctx: Context,
  auth: Authenticator,
  fileId: string
): Promise<FileResource | Response> {
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  }

  if (!file.isShareableFrame) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files support sharing grants.",
      },
    });
  }

  if (file.isFrameV2) {
    await file.ensureShareableFrame(auth);
  }

  return file;
}

export default app;
