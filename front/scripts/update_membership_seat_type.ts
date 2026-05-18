/**
 * Update a single membership's seat type and re-sync the Metronome seat count
 * for the workspace.
 *
 * Run with:
 *   npx tsx scripts/update_membership_seat_type.ts \
 *     --wId <workspaceSId> --userId <userSId> --seatType <free|workspace|pro|max> \
 *     [--execute]
 */

import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import {
  isMembershipSeatType,
  MEMBERSHIP_SEAT_TYPES,
} from "@app/types/memberships";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId",
    },
    userId: {
      type: "string",
      demandOption: true,
      description: "User sId",
    },
    seatType: {
      type: "string",
      demandOption: true,
      choices: [...MEMBERSHIP_SEAT_TYPES],
      description: "Target seat type",
    },
  },
  async ({ wId, userId, seatType, execute }, logger) => {
    if (!isMembershipSeatType(seatType)) {
      logger.error({ seatType }, "Invalid seat type");
      return;
    }

    const workspace = await WorkspaceResource.fetchById(wId);
    if (!workspace) {
      logger.error({ wId }, "Workspace not found");
      return;
    }
    const lightWorkspace = renderLightWorkspaceType({ workspace });

    const user = await UserResource.fetchById(userId);
    if (!user) {
      logger.error({ userId }, "User not found");
      return;
    }

    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: lightWorkspace,
      });
    if (!membership) {
      logger.error({ wId, userId }, "Membership not found");
      return;
    }

    logger.info(
      {
        wId,
        userId,
        currentSeatType: membership.seatType,
        newSeatType: seatType,
      },
      "Updating membership seat type"
    );

    if (!execute) {
      return;
    }

    const res = await updateMembershipSeatAndTrack({
      user,
      workspace: lightWorkspace,
      newSeatType: seatType,
      author: "no-author",
    });

    if (res.isErr()) {
      logger.error(
        { wId, userId, error: res.error },
        "Failed to update membership seat type"
      );
      return;
    }

    logger.info(
      {
        wId,
        userId,
        previousSeatType: res.value.previousSeatType,
        newSeatType: res.value.newSeatType,
      },
      "Membership seat type updated"
    );
  }
);
