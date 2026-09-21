import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";

const argumentSpecs: ArgumentSpecs = {
  workspaceId: {
    type: "string",
    alias: "w",
    description: "Workspace sId to unrevoke membership in",
    demandOption: true,
  },
  userId: {
    type: "string",
    alias: "u",
    description: "User sId to unrevoke",
    demandOption: true,
  },
};

makeScript(
  argumentSpecs,
  async ({ workspaceId, userId, execute }, scriptLogger) => {
    // Get workspace
    const workspace = await getWorkspaceInfos(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Get user
    const user = await UserResource.fetchById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    scriptLogger.info(
      {
        workspaceId: workspace.sId,
        userId: user.sId,
        userEmail: user.email,
        execute,
      },
      "Processing user membership unrevocation"
    );

    // Check current membership status
    const latestMembership =
      await MembershipResource.getLatestMembershipOfUserInWorkspace({
        user,
        workspace,
      });

    if (!latestMembership) {
      scriptLogger.error(
        { userId: user.sId, workspaceId: workspace.sId },
        "No membership found for user in workspace"
      );
      return;
    }

    if (!latestMembership.endAt) {
      scriptLogger.warn(
        {
          userId: user.sId,
          workspaceId: workspace.sId,
          currentRole: latestMembership.role,
        },
        "Membership is already active (not revoked)"
      );
      return;
    }

    scriptLogger.info(
      {
        previousRole: latestMembership.role,
        revokedAt: latestMembership.endAt,
      },
      "Found revoked membership"
    );

    if (execute) {
      // Use updateMembershipRole with allowTerminated=true to unrevoke
      const result = await MembershipResource.updateMembershipRole({
        user,
        workspace,
        newRole: latestMembership.role,
        allowTerminated: true,
        author: "no-author",
      });

      if (result.isOk()) {
        scriptLogger.info(
          {
            userId: user.sId,
            userEmail: user.email,
            workspaceId: workspace.sId,
            previousRole: result.value.previousRole,
            newRole: result.value.newRole,
          },
          "Successfully unrevoked membership"
        );
      } else {
        scriptLogger.error(
          {
            userId: user.sId,
            workspaceId: workspace.sId,
            error: result.error,
          },
          "Failed to unrevoke membership"
        );
      }
    } else {
      scriptLogger.info(
        {
          userId: user.sId,
          userEmail: user.email,
          workspaceId: workspace.sId,
        },
        "Dry run: would unrevoke membership"
      );
    }
  }
);
