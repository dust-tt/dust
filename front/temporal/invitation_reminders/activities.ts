import { sendWorkspaceInvitationReminderEmail } from "@app/lib/api/invitation";
import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const EMAIL_CONCURRENCY = 8;
const BATCH_SIZE = 50;

// Returns true if a full batch was processed, meaning there may be more to process.
export async function sendInvitationReminderBatchActivity(): Promise<boolean> {
  const entWorkspaceModelIds =
    await SubscriptionResource.listActiveENTWorkspaceModelIds();

  if (entWorkspaceModelIds.length === 0) {
    return false;
  }

  const invitations =
    await MembershipInvitationResource.listEligibleForReminder(
      entWorkspaceModelIds,
      { limit: BATCH_SIZE }
    );

  if (invitations.length === 0) {
    return false;
  }

  // Group by workspaceId to create the Authenticator once per workspace.
  const byWorkspaceId = new Map<string, typeof invitations>();
  for (const invitation of invitations) {
    byWorkspaceId.set(invitation.workspace.sId, [
      ...(byWorkspaceId.get(invitation.workspace.sId) ?? []),
      invitation,
    ]);
  }

  let sent = 0;
  let failed = 0;

  for (const [workspaceId, batch] of byWorkspaceId) {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    await concurrentExecutor(
      batch,
      async (invitation) => {
        let newInvitation: MembershipInvitationResource | null = null;
        try {
          newInvitation = await withTransaction(async (t) => {
            const created = await MembershipInvitationResource.makeNew(
              auth,
              {
                inviteEmail: invitation.inviteEmail,
                initialRole: invitation.initialRole,
                status: "pending",
              },
              t
            );
            await invitation.revoke(t);
            return created;
          });
        } catch (err) {
          logger.error(
            {
              err: normalizeError(err),
              inviteEmail: invitation.inviteEmail,
              workspaceId,
            },
            "[Invitation Reminders] Failed to revoke/recreate invitation."
          );
          failed++;
          return;
        }

        try {
          await sendWorkspaceInvitationReminderEmail(
            auth.getNonNullableWorkspace(),
            newInvitation.toJSON()
          );
          sent++;
        } catch (err) {
          logger.error(
            {
              err: normalizeError(err),
              inviteEmail: invitation.inviteEmail,
              workspaceId,
            },
            "[Invitation Reminders] Failed to send reminder email."
          );
          failed++;
        }
      },
      { concurrency: EMAIL_CONCURRENCY }
    );
  }

  logger.info({ sent, failed }, "[Invitation Reminders] Batch complete.");

  return invitations.length === BATCH_SIZE;
}
