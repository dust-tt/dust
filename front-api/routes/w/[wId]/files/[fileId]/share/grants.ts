import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import {
  isConversationFileUseCase,
  isInteractiveContentType,
  MAX_EMAILS_PER_INVITE,
} from "@app/types/files";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import type { Context } from "hono";
import { z } from "zod";

const AddGrantsRequestBodySchema = z.object({
  emails: z.array(z.string().email()).min(1).max(MAX_EMAILS_PER_INVITE),
});

const RevokeGrantRequestBodySchema = z.object({
  grantId: z.number(),
});

// Mounted at /api/w/:wId/files/:fileId/share/grants.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

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

app.post("/", validate("json", AddGrantsRequestBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

  const file = await fetchShareableFile(ctx, auth, fileId);
  if (file instanceof Response) {
    return file;
  }

  const { emails: rawEmails } = ctx.req.valid("json");

  const workspace = auth.getNonNullableWorkspace();
  if (workspace.sharingPolicy === "workspace_only") {
    const emails = rawEmails.map((e) => e.toLowerCase());
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

    const hasNonMemberEmails = emails.some((e) => !memberEmails.has(e));
    if (hasNonMemberEmails) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message:
            "Only workspace members can be invited when external sharing is disabled.",
        },
      });
    }
  }

  const grants = await file.addSharingGrants(auth, { emails: rawEmails });
  return ctx.json({ grants });
});

app.delete("/", validate("json", RevokeGrantRequestBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

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

  return ctx.body(null, 204);
});

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

  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files support sharing grants.",
      },
    });
  }

  return file;
}

export default app;
