import config from "@app/lib/api/config";
import { sendWorkspaceInvitationReminderEmail } from "@app/lib/api/invitation";
import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Context } from "@temporalio/activity";

const EMAIL_CONCURRENCY = 8;
const BATCH_SIZE = 50;

// Returns true if a full batch was processed, meaning there may be more to process.
export async function sendInvitationReminderBatchActivity(): Promise<boolean> {
  // Preflight: fail fast before mutating any rows if config is missing.
  config.getInvitationReminderEmailTemplate();
  config.getSendgridApiKey();

  const invitations =
    await MembershipInvitationResource.listEligibleForReminder({
      limit: BATCH_SIZE,
    });

  if (invitations.length === 0) {
    return false;
  }

  Context.current().heartbeat();

  // Group by workspaceId to create the Authenticator once per workspace.
  const byWorkspaceId = new Map<string, typeof invitations>();
  for (const invitation of invitations) {
    const group = byWorkspaceId.get(invitation.workspace.sId) ?? [];
    group.push(invitation);
    byWorkspaceId.set(invitation.workspace.sId, group);
  }

  let emailsFailed = 0;

  for (const [workspaceId, batch] of byWorkspaceId) {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    await concurrentExecutor(
      batch,
      async (invitation) => {
        // DB failure propagates → concurrentExecutor aborts → activity fails → Temporal retries.
        // Safe to retry: claimReminderSlot uses a conditional UPDATE (WHERE reminderSentAt IS NULL)
        // so already-claimed invitations are skipped on the next attempt.
        const claimed = await invitation.claimReminderSlot();

        if (!claimed) {
          return;
        }

        try {
          await sendWorkspaceInvitationReminderEmail(
            auth.getNonNullableWorkspace(),
            invitation.toJSON()
          );
        } catch (err) {
          // Email failure is per-item and non-retryable at activity level.
          // reminderSentAt is already set, so this invitation won't be retried automatically.
          logger.error(
            {
              err: normalizeError(err),
              inviteEmail: invitation.inviteEmail,
              workspaceId,
            },
            "[Invitation Reminders] Failed to send reminder email."
          );
          emailsFailed++;
        }
      },
      { concurrency: EMAIL_CONCURRENCY }
    );

    Context.current().heartbeat();
  }

  if (emailsFailed > 0) {
    logger.warn(
      { emailsFailed },
      "[Invitation Reminders] Some reminder emails failed to send."
    );
  }

  return invitations.length === BATCH_SIZE;
}
