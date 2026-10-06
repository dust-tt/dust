import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  getMembers,
  getWorkspaceAdministrationVersionLock,
} from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import type { EmailRecipient } from "@app/lib/notifications/transactional_emails";
import { emailRecipientsFromAddresses } from "@app/lib/notifications/transactional_emails";
import { notifyWorkspaceInvitation } from "@app/lib/notifications/triggers/workspace-invitation";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { isEmailValid } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getMembershipInvitationUrl } from "@app/lib/utils/invitation_token";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import { MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY } from "@app/types/membership_invitation";
import type { MembershipSeatType } from "@app/types/memberships";
import type { SubscriptionType } from "@app/types/plan";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { sanitizeString } from "@app/types/shared/utils/string_utils";
import type {
  ActiveRoleType,
  LightWorkspaceType,
  UserType,
  WorkspaceType,
} from "@app/types/user";

import { MembershipInvitationResource } from "../resources/membership_invitation_resource";

const EMAIL_CONCURRENCY = 8;

function sendWorkspaceInvitationEmail(
  owner: WorkspaceType,
  user: UserType,
  invitation: MembershipInvitationType,
  recipient: EmailRecipient
): Promise<Result<void, Error>> {
  return notifyWorkspaceInvitation({
    recipient,
    workspaceId: owner.sId,
    workspaceName: owner.name,
    inviterName: user.fullName,
    inviteLink: getMembershipInvitationUrl(owner, invitation),
    isReminder: false,
  });
}

export function sendWorkspaceInvitationReminderEmail(
  owner: LightWorkspaceType,
  invitation: MembershipInvitationType,
  recipient: EmailRecipient
): Promise<Result<void, Error>> {
  return notifyWorkspaceInvitation({
    recipient,
    workspaceId: owner.sId,
    workspaceName: owner.name,
    inviterName: null,
    inviteLink: getMembershipInvitationUrl(owner, invitation),
    isReminder: true,
  });
}

/**
 * Returns the pending or revoked inviations that were created today
 *  associated with the authenticator's owner workspace.
 * @param auth Authenticator
 * @returns MenbershipInvitation[] members of the workspace
 */

interface MembershipInvitationBlob {
  email: string;
  role: ActiveRoleType;
  seatType?: MembershipSeatType | null;
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
): Promise<
  Result<HandleMembershipInvitationResult[], APIErrorWithContentfulStatusCode>
> {
  const { maxUsers } = subscription.plan.limits.users;

  // Emails are sent after the transaction commits so the DB transaction is
  // not held open during Novu calls.
  const transactionResult = await withTransaction(
    async (
      t
    ): Promise<
      Result<InvitationTransactionPayload, APIErrorWithContentfulStatusCode>
    > => {
      await getWorkspaceAdministrationVersionLock(owner, t);

      if (maxUsers !== -1) {
        const [membersCount, pendingInvitationsCount] = await Promise.all([
          MembershipResource.getMembersCountForWorkspace({
            workspace: owner,
            activeOnly: true,
            transaction: t,
          }),
          MembershipInvitationResource.getPendingInvitationsCountForWorkspace({
            workspace: owner,
            transaction: t,
          }),
        ]);

        const availableSeats = Math.max(
          maxUsers - membersCount - pendingInvitationsCount,
          0
        );

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
      const emailToRequestedRole = new Map(
        invitationRequests.map((r) => [r.email.toLowerCase().trim(), r.role])
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

      await MembershipInvitationResource.bulkUnrevoke(auth, {
        invitations: invitationsToUnrevoke.map((i) => ({
          invitationId: i.sId,
          role:
            emailToRequestedRole.get(i.inviteEmail.toLowerCase().trim()) ??
            i.initialRole,
        })),
        transaction: t,
      });

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
        seatType?: MembershipSeatType | null;
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
            seatType: req.seatType,
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
        seatType?: MembershipSeatType | null;
      }[] = [];
      const invitationBySanitizedEmail = new Map<
        string,
        MembershipInvitationType
      >();

      for (const {
        sanitizedEmail,
        role,
        seatType,
      } of uniqueCandidateBySanitizedEmail.values()) {
        const existing = existingByEmail.get(sanitizedEmail);
        if (existing) {
          toRevokeModelIds.push(existing.id);
        }
        toCreate.push({
          inviteEmail: sanitizedEmail,
          initialRole: role,
          seatType: seatType ?? null,
        });
      }

      await MembershipInvitationResource.bulkRevokeByModelIds(auth, {
        modelIds: toRevokeModelIds,
        transaction: t,
      });

      const created = await MembershipInvitationResource.bulkMakeNewPending(
        auth,
        { blobs: toCreate, transaction: t }
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

  const recipients = await emailRecipientsFromAddresses(
    invitationsToEmail.map(({ invitation }) => invitation.inviteEmail)
  );
  const emailResults = await concurrentExecutor(
    invitationsToEmail,
    async ({ invitation, email }, index) => {
      const result = await sendWorkspaceInvitationEmail(
        owner,
        user,
        invitation,
        recipients[index]
      );
      if (result.isErr()) {
        logger.error(
          { error: result.error, email },
          "Failed to send invitation email"
        );
        return {
          success: false,
          email,
          error_message: result.error.message,
        };
      }
      return { success: true, email };
    },
    { concurrency: EMAIL_CONCURRENCY }
  );

  const allResults: HandleMembershipInvitationResult[] = [
    ...resultsWithoutEmail,
    ...emailResults,
  ];

  // Emit one member.invited event per invited user, each recording the invitee
  // as the user target and the role they were invited with. A single event with
  // one target per invite would exceed WorkOS's `maxItems: 20` targets limit on
  // bulk invites (causing `invalid_audit_log`). Bulk vs. individual is captured
  // separately by `member.bulk_invited`, so it is not duplicated here.
  // Key on the sanitized email (trim + lowercase) since that is how invitation
  // emails are normalized when stored, so the role lookup matches both the
  // freshly-emailed invites and the unrevoked ones.
  const roleByEmail = new Map(
    invitationRequests.map((r) => [sanitizeString(r.email), r.role])
  );
  const successfulInvites = allResults.filter((r) => r.success);
  for (const invite of successfulInvites) {
    const role = roleByEmail.get(sanitizeString(invite.email));
    void emitAuditLogEvent({
      auth,
      action: "member.invited",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("user", {
          sId: invite.email,
          name: invite.email,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: role ? { role } : {},
    });
  }

  return new Ok(allResults);
}
