import config from "@app/lib/api/config";
import { sendWorkspaceInvitationReminderEmail } from "@app/lib/api/invitation";
import { emailRecipientsFromWorkspaceAddresses } from "@app/lib/notifications/transactional_emails";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { Context } from "@temporalio/activity";

const EMAIL_CONCURRENCY = 8;
const BATCH_SIZE = 50;

// Returns true if a full batch was processed, meaning there may be more to process.
export async function sendInvitationReminderBatchActivity(): Promise<boolean> {
  // Preflight: fail fast before mutating any rows if config is missing.
  config.getNovuSecretKey();

  const invitations =
    await MembershipInvitationResource.listEligibleForReminder({
      limit: BATCH_SIZE,
    });

  if (invitations.length === 0) {
    return false;
  }

  Context.current().heartbeat();

  // Resolve recipients for the whole batch at once to avoid a lookup per workspace.
  const recipients = await emailRecipientsFromWorkspaceAddresses(
    invitations.map((invitation) => ({
      workspace: invitation.workspace,
      email: invitation.inviteEmail,
    }))
  );

  let emailsFailed = 0;

  await concurrentExecutor(
    invitations,
    async (invitation, index) => {
      // DB failure propagates → concurrentExecutor aborts → activity fails → Temporal retries.
      // Safe to retry: claimReminderSlot uses a conditional UPDATE (WHERE reminderSentAt IS NULL)
      // so already-claimed invitations are skipped on the next attempt.
      const claimed = await invitation.claimReminderSlot();

      if (!claimed) {
        return;
      }

      const owner = renderLightWorkspaceType({
        workspace: invitation.workspace,
      });

      // Email failure is per-item and non-retryable at activity level.
      // reminderSentAt is already set, so this invitation won't be retried automatically.
      const result = await sendWorkspaceInvitationReminderEmail(
        owner,
        invitation.toJSON(),
        recipients[index]
      );
      if (result.isErr()) {
        logger.error(
          {
            err: result.error,
            inviteEmail: invitation.inviteEmail,
            workspaceId: owner.sId,
          },
          "[Invitation Reminders] Failed to send reminder email."
        );
        emailsFailed++;
      }

      Context.current().heartbeat();
    },
    { concurrency: EMAIL_CONCURRENCY }
  );

  if (emailsFailed > 0) {
    logger.warn(
      { emailsFailed },
      "[Invitation Reminders] Some reminder emails failed to send."
    );
  }

  return invitations.length === BATCH_SIZE;
}
