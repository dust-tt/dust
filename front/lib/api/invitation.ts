import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import {
  getMembers,
  getWorkspaceAdministrationVersionLock,
} from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { INVITATION_EXPIRATION_TIME_SEC } from "@app/lib/constants/invitation";
import { MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY } from "@app/lib/invitations";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { isEmailValid } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import type { SubscriptionType } from "@app/types/plan";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { sanitizeString } from "@app/types/shared/utils/string_utils";
import type {
  ActiveRoleType,
  LightWorkspaceType,
  UserType,
  WorkspaceType,
} from "@app/types/user";
import sgMail from "@sendgrid/mail";
import { escape } from "html-escaper";
import { sign } from "jsonwebtoken";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { MembershipInvitationResource } from "../resources/membership_invitation_resource";

const EMAIL_CONCURRENCY = 8;

export async function getInvitation(
  auth: Authenticator,
  {
    invitationId,
  }: {
    invitationId: string;
  }
): Promise<MembershipInvitationType | null> {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return null;
  }

  const invitation = await MembershipInvitationResource.fetchById(
    auth,
    invitationId
  );

  if (!invitation) {
    return null;
  }

  return invitation.toJSON();
}

export function getMembershipInvitationToken(
  invitation: MembershipInvitationType
) {
  const iat = Math.floor(invitation.createdAt / 1000);
  const exp = iat + INVITATION_EXPIRATION_TIME_SEC;

  return sign(
    {
      membershipInvitationId: invitation.id,
      iat,
      exp,
    },
    config.getDustInviteTokenSecret()
  );
}

function getMembershipInvitationUrlForToken(
  owner: LightWorkspaceType,
  invitationToken: string
) {
  return `${config.getAppUrl()}/w/${owner.sId}/join/?t=${invitationToken}`;
}

export function getMembershipInvitationUrl(
  owner: LightWorkspaceType,
  invitation: MembershipInvitationType
) {
  const invitationToken = getMembershipInvitationToken(invitation);
  return getMembershipInvitationUrlForToken(owner, invitationToken);
}

export async function sendWorkspaceInvitationEmail(
  owner: WorkspaceType,
  user: UserType,
  invitation: MembershipInvitationType
) {
  // Send invite email.
  const message = {
    to: invitation.inviteEmail,
    from: config.getSupportEmailAddress(),
    templateId: config.getInvitationEmailTemplate(),
    dynamic_template_data: {
      inviteLink: getMembershipInvitationUrl(owner, invitation),
      // Escape the name to prevent XSS attacks via injected script elements.
      inviterName: escape(user.fullName),
      workspaceName: owner.name,
    },
  };

  sgMail.setApiKey(config.getSendgridApiKey());
  await sgMail.send(message);
}

/**
 * Returns the pending or revoked inviations that were created today
 *  associated with the authenticator's owner workspace.
 * @param auth Authenticator
 * @returns MenbershipInvitation[] members of the workspace
 */

export async function batchUnrevokeInvitations(
  auth: Authenticator,
  invitationIds: string[],
  transaction?: Transaction
) {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    throw new Error(
      "Only users that are `admins` for the current workspace can see membership invitations or modify them."
    );
  }

  await MembershipInvitationModel.update(
    {
      status: "pending",
    },
    {
      where: {
        sId: {
          [Op.in]: invitationIds,
        },
        workspaceId: owner.id,
      },
      transaction,
    }
  );
}

interface MembershipInvitationBlob {
  email: string;
  role: ActiveRoleType;
}

export interface HandleMembershipInvitationResult {
  success: boolean;
  email: string;
  error_message?: string;
}

interface InvitationToEmail {
  invitation: MembershipInvitationType;
  email: string;
}

interface InvitationTransactionPayload {
  resultsWithoutEmail: HandleMembershipInvitationResult[];
  invitationsToEmail: InvitationToEmail[];
}

export async function handleMembershipInvitations(
  auth: Authenticator,
  {
    invitationRequests,
    owner,
    subscription,
    user,
    force = false,
  }: {
    owner: WorkspaceType;
    subscription: SubscriptionType;
    user: UserType;
    invitationRequests: MembershipInvitationBlob[];
    force?: boolean;
  }
): Promise<Result<HandleMembershipInvitationResult[], APIErrorWithStatusCode>> {
  const { maxUsers } = subscription.plan.limits.users;

  // Emails are sent after the transaction commits so the DB transaction is
  // not held open during SendGrid calls.
  const transactionResult = await withTransaction(
    async (
      t
    ): Promise<
      Result<InvitationTransactionPayload, APIErrorWithStatusCode>
    > => {
      if (maxUsers !== -1) {
        await getWorkspaceAdministrationVersionLock(owner, t);

        const membersCount =
          await MembershipResource.getMembersCountForWorkspace({
            workspace: owner,
            activeOnly: true,
            transaction: t,
          });

        const availableSeats = Math.max(maxUsers - membersCount, 0);

        if (availableSeats < invitationRequests.length) {
          const message =
            availableSeats === 0
              ? `Plan limited to ${maxUsers} seats. All seats used`
              : `Plan limited to ${maxUsers} seats. Can't invite ${invitationRequests.length} members (only ${availableSeats} seats available). `;

          return new Err({
            status_code: 400,
            api_error: {
              type: "plan_limit_error",
              message,
            },
          });
        }
      }

      const invalidEmails = invitationRequests.filter(
        (b) => !isEmailValid(b.email)
      );
      if (invalidEmails.length > 0) {
        return new Err({
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid email address(es): " + invalidEmails.join(", "),
          },
        });
      }

      const { members: existingMembers } = await getMembers(auth, {
        activeOnly: true,
        transaction: t,
      });

      const unconsumedInvitations =
        await MembershipInvitationResource.listRecentPendingAndRevokedInvitations(
          auth,
          t
        );
      if (
        unconsumedInvitations.pending.length >=
        MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY
      ) {
        return new Err({
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Too many pending invitations. Please ask your members to consume their invitations before sending more.`,
          },
        });
      }

      const emailsWithRecentUnconsumedInvitations = new Set([
        ...unconsumedInvitations.pending.map((i) =>
          i.inviteEmail.toLowerCase().trim()
        ),
        ...unconsumedInvitations.revoked.map((i) =>
          i.inviteEmail.toLowerCase().trim()
        ),
      ]);
      const requestedEmails = new Set(
        invitationRequests.map((r) => r.email.toLowerCase().trim())
      );
      const emailsToSendInvitations = force
        ? invitationRequests
        : invitationRequests.filter(
            (r) =>
              !emailsWithRecentUnconsumedInvitations.has(
                r.email.toLowerCase().trim()
              )
          );
      const invitationsToUnrevoke = force
        ? []
        : unconsumedInvitations.revoked.filter((i) =>
            requestedEmails.has(i.inviteEmail.toLowerCase().trim())
          );

      if (
        !emailsToSendInvitations.length &&
        !invitationsToUnrevoke.length &&
        invitationRequests.length > 0 &&
        !force
      ) {
        return new Err({
          status_code: 400,
          api_error: {
            type: "invitation_already_sent_recently",
            message: `These emails have already received an invitation in the last 24 hours. Please wait before sending another invitation.`,
          },
        });
      }

      await batchUnrevokeInvitations(
        auth,
        invitationsToUnrevoke.map((i) => i.sId),
        t
      );

      const resultsWithoutEmail: HandleMembershipInvitationResult[] =
        invitationsToUnrevoke.map((i) => ({
          success: true,
          email: i.inviteEmail,
        }));

      const existingMemberEmails = new Set(existingMembers.map((m) => m.email));
      const dbCandidates: {
        originalEmail: string;
        sanitizedEmail: string;
        role: ActiveRoleType;
      }[] = [];
      for (const req of emailsToSendInvitations) {
        if (existingMemberEmails.has(req.email)) {
          resultsWithoutEmail.push({
            success: false,
            email: req.email,
            error_message: "Cannot send invitation to existing active member.",
          });
        } else {
          dbCandidates.push({
            originalEmail: req.email,
            sanitizedEmail: sanitizeString(req.email),
            role: req.role,
          });
        }
      }

      // If the caller sends the same address twice, last role wins.
      const uniqueCandidateBySanitizedEmail = new Map(
        dbCandidates.map((c) => [c.sanitizedEmail, c])
      );

      const existingInvitations =
        await MembershipInvitationResource.listPendingForEmailsAndWorkspace({
          emails: Array.from(uniqueCandidateBySanitizedEmail.keys()),
          workspace: owner,
          includeExpired: true,
          transaction: t,
        });
      const existingByEmail = new Map(
        existingInvitations.map((inv) => [inv.inviteEmail, inv])
      );

      const toRevokeModelIds: ModelId[] = [];
      const toCreate: {
        inviteEmail: string;
        initialRole: ActiveRoleType;
      }[] = [];
      // Group role updates by target role so we issue one UPDATE per distinct
      // role (bounded by the number of active roles) instead of per invitation.
      const toUpdateRoleByRole = new Map<ActiveRoleType, ModelId[]>();
      const invitationBySanitizedEmail = new Map<
        string,
        MembershipInvitationType
      >();

      for (const {
        sanitizedEmail,
        role,
      } of uniqueCandidateBySanitizedEmail.values()) {
        const existing = existingByEmail.get(sanitizedEmail);
        if (!existing || existing.isExpired()) {
          if (existing) {
            toRevokeModelIds.push(existing.id);
          }
          toCreate.push({
            inviteEmail: sanitizedEmail,
            initialRole: role,
          });
        } else {
          if (existing.initialRole !== role) {
            const group = toUpdateRoleByRole.get(role) ?? [];
            group.push(existing.id);
            toUpdateRoleByRole.set(role, group);
          }
          invitationBySanitizedEmail.set(sanitizedEmail, {
            ...existing.toJSON(),
            initialRole: role,
          });
        }
      }

      await MembershipInvitationResource.bulkRevokeByModelIds(
        auth,
        toRevokeModelIds,
        t
      );

      for (const [role, modelIds] of toUpdateRoleByRole) {
        await MembershipInvitationResource.bulkUpdateInitialRoleByModelIds(
          auth,
          modelIds,
          role,
          t
        );
      }

      const created = await MembershipInvitationResource.bulkMakeNewPending(
        auth,
        toCreate,
        t
      );
      for (const invitation of created) {
        invitationBySanitizedEmail.set(
          invitation.inviteEmail,
          invitation.toJSON()
        );
      }

      // One entry per original request so the response count matches the
      // caller; duplicate addresses share the same underlying invitation row.
      const invitationsToEmail: InvitationToEmail[] = [];
      for (const { originalEmail, sanitizedEmail } of dbCandidates) {
        const invitation = invitationBySanitizedEmail.get(sanitizedEmail);
        if (invitation) {
          invitationsToEmail.push({ invitation, email: originalEmail });
        }
      }

      return new Ok({ resultsWithoutEmail, invitationsToEmail });
    }
  );

  if (transactionResult.isErr()) {
    return transactionResult;
  }

  const { resultsWithoutEmail, invitationsToEmail } = transactionResult.value;

  const emailResults = await concurrentExecutor(
    invitationsToEmail,
    async ({ invitation, email }) => {
      try {
        await sendWorkspaceInvitationEmail(owner, user, invitation);
        return { success: true, email };
      } catch (e) {
        logger.error(
          {
            error: e,
            message: "Failed to send invitation email",
            email,
          },
          "Failed to send invitation email"
        );
        return {
          success: false,
          email,
          error_message: normalizeError(e).message,
        };
      }
    },
    { concurrency: EMAIL_CONCURRENCY }
  );

  const allResults: HandleMembershipInvitationResult[] = [
    ...resultsWithoutEmail,
    ...emailResults,
  ];

  const successfulInvites = allResults.filter((r) => r.success);
  if (successfulInvites.length > 0) {
    void emitAuditLogEvent({
      auth,
      action: "member.invited",
      targets: successfulInvites.map((r) =>
        buildAuditLogTarget("user", { sId: r.email, name: r.email })
      ),
      context: getAuditLogContext(auth),
      metadata: {
        invitedCount: String(successfulInvites.length),
        emails: successfulInvites.map((r) => r.email).join(","),
      },
    });
  }

  return new Ok(allResults);
}
