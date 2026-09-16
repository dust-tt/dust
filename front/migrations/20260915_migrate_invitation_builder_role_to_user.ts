import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

/**
 * Flip every `membership_invitations.initialRole` still holding the removed
 * `builder` role to `user`. Memberships and keys were migrated by earlier
 * backfills; invitations (pending or already consumed/revoked) were not.
 * One-shot, re-runnable. Until this has run, `MembershipInvitationResource`
 * normalizes `builder` to `user` at read time.
 */

const LEGACY_BUILDER_ROLE = "builder";

makeScript({}, async ({ execute }, logger) => {
  let totalMatched = 0;
  let totalMigrated = 0;

  await runOnAllWorkspaces(async (workspace) => {
    const where = {
      workspaceId: workspace.id,
      initialRole: LEGACY_BUILDER_ROLE,
    };

    if (!execute) {
      const matched = await MembershipInvitationModel.count({ where });
      if (matched > 0) {
        totalMatched += matched;
        logger.info(
          {
            workspaceId: workspace.sId,
            workspaceModelId: workspace.id,
            matched,
          },
          "Would flip invitation initialRole builder -> user"
        );
      }
      return;
    }

    const [migrated] = await MembershipInvitationModel.update(
      { initialRole: "user" },
      { where }
    );
    if (migrated > 0) {
      totalMigrated += migrated;
      logger.info(
        {
          workspaceId: workspace.sId,
          workspaceModelId: workspace.id,
          migrated,
        },
        "Flipped invitation initialRole builder -> user"
      );
    }
  });

  logger.info(
    execute ? { totalMigrated } : { totalMatched },
    execute
      ? "Invitation builder -> user migration complete"
      : "Invitation builder -> user migration dry run complete"
  );
});
