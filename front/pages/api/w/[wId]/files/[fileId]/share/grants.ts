/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { SharingGrantType } from "@app/types/files";
import {
  isConversationFileUseCase,
  isInteractiveContentType,
  MAX_EMAILS_PER_INVITE,
} from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const AddGrantsRequestBodySchema = z.object({
  emails: z.array(z.string().email()).min(1).max(MAX_EMAILS_PER_INVITE),
});

const RevokeGrantRequestBodySchema = z.object({
  grantId: z.number(),
});

interface GrantsResponseBody {
  grants: SharingGrantType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GrantsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("email_restricted_sharing")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Email-restricted sharing is not enabled for this workspace.",
      },
    });
  }

  const { fileId } = req.query;
  if (!isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    // For conversation files, check if the user has access to the conversation.
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  // Only allow sharing Frame files.
  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files support sharing grants.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
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

        return res.status(200).json({
          grants: grants.map((g) => ({
            ...g,
            blockedByPolicy: !memberEmails.has(g.email.toLowerCase()),
          })),
        });
      }

      return res.status(200).json({ grants });
    }

    case "POST": {
      const parseResult = AddGrantsRequestBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${parseResult.error.message}`,
          },
        });
      }

      const workspace = auth.getNonNullableWorkspace();
      if (workspace.sharingPolicy === "workspace_only") {
        const emails = parseResult.data.emails.map((e) => e.toLowerCase());
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
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message:
                "Only workspace members can be invited when external sharing is disabled.",
            },
          });
        }
      }

      const grants = await file.addSharingGrants(auth, {
        emails: parseResult.data.emails,
      });

      return res.status(200).json({ grants });
    }

    case "DELETE": {
      const parseResult = RevokeGrantRequestBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${parseResult.error.message}`,
          },
        });
      }

      const result = await file.revokeSharingGrant({
        grantId: parseResult.data.grantId,
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: result.error.message,
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only GET, POST, and DELETE methods are supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
