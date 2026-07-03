import { createPlugin } from "@app/lib/api/poke/types";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const ACTIVATION_POD_NAME_PREFIX = "Activation Pod - ";

const joinActivationPodLogger = logger.child({
  activity: "join-activation-pod",
});

function activationPodNameForEmail(email: string): string {
  return `${ACTIVATION_POD_NAME_PREFIX}${email}`;
}

async function getManualMemberGroup(
  space: SpaceResource
): Promise<GroupResource | null> {
  const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
    space,
    filterOnManagementMode: true,
  });
  if (memberGroupSpaces.length !== 1) {
    return null;
  }
  return memberGroupSpaces[0].group;
}

// Adds the user to the pod's manual member group if they are not already in it.
// Does not add the same user multiple times, so it is safe to call repeatedly for the same user and pod.
async function ensureUserInMemberGroup(
  auth: Authenticator,
  space: SpaceResource,
  user: UserResource
): Promise<Result<{ added: boolean }, Error>> {
  const memberGroup = await getManualMemberGroup(space);
  if (!memberGroup) {
    return new Err(new Error("Pod does not have a manual member group."));
  }

  const currentMembers = await memberGroup.getActiveMembers(auth);
  if (currentMembers.some((member) => member.sId === user.sId)) {
    return new Ok({ added: false });
  }

  const addResult = await memberGroup.dangerouslyAddMembers(auth, {
    users: [user.toJSON()],
  });
  if (addResult.isErr()) {
    return new Err(
      new Error(`Failed to add the user to the pod: ${addResult.error.message}`)
    );
  }

  return new Ok({ added: true });
}

export const joinActivationPodPlugin = createPlugin({
  manifest: {
    id: "join-activation-pod",
    name: "Join Activation Pod",
    description:
      "Create a personal activation Pod for a workspace member and invite them to it.",
    resourceTypes: ["workspaces"],
    args: {
      userEmail: {
        type: "string",
        label: "User email",
        description:
          "Email of the workspace member(s) to provision an activation Pod for.",
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (auth, _resource, { userEmail }) => {
    const email = userEmail.trim().toLowerCase();
    if (email.length === 0) {
      return new Err(new Error("A user email is required."));
    }

    const workspace = auth.getNonNullableWorkspace();

    const user = await UserResource.fetchByEmail(email);
    if (!user) {
      return new Err(new Error(`No user found with email "${email}".`));
    }

    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
      });
    if (!membership) {
      return new Err(
        new Error(
          `User "${user.username}" is not an active member of this workspace.`
        )
      );
    }

    const podName = activationPodNameForEmail(user.email);
    const podLink = (space: SpaceResource) =>
      `/poke/${workspace.sId}/spaces/${space.sId}`;

    // If the activation pod already exists, return it (after making sure the user is invited).
    const existingPods = await SpaceResource.listProjectSpaces(auth);
    const existingPod = existingPods.find((space) => space.name === podName);
    if (existingPod) {
      const inviteResult = await ensureUserInMemberGroup(
        auth,
        existingPod,
        user
      );
      if (inviteResult.isErr()) {
        return inviteResult;
      }

      joinActivationPodLogger.info(
        {
          action: "join_activation_pod",
          created: false,
          invited: inviteResult.value.added,
          spaceId: existingPod.sId,
          userId: user.sId,
          workspaceId: workspace.sId,
        },
        "Returned existing activation pod via poke"
      );

      return new Ok({
        display: "textWithLink",
        value:
          `Activation Pod already exists for ${user.username}. ` +
          (inviteResult.value.added
            ? "The user was missing and has been invited."
            : "The user is already a member."),
        link: podLink(existingPod),
        linkText: "Open Pod in Poke",
      });
    }

    // The user is added to the pod as editor. Pods reject members at creation time, so the user
    // is added to the member group in a second step.
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const createResult = await createSpaceAndGroup(userAuth, {
      name: podName,
      isRestricted: true,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });

    if (createResult.isErr()) {
      return new Err(new Error(createResult.error.message));
    }
    const pod = createResult.value;

    const inviteResult = await ensureUserInMemberGroup(auth, pod, user);
    if (inviteResult.isErr()) {
      return inviteResult;
    }

    joinActivationPodLogger.info(
      {
        action: "join_activation_pod",
        created: true,
        invited: inviteResult.value.added,
        spaceId: pod.sId,
        userId: user.sId,
        workspaceId: workspace.sId,
      },
      "Created activation pod via poke"
    );

    return new Ok({
      display: "textWithLink",
      value: `Created activation Pod for ${user.username} and invited them.`,
      link: podLink(pod),
      linkText: "Open Pod in Poke",
    });
  },
});
