import { createOnboardingConversationIfNeeded } from "@app/lib/api/assistant/onboarding";
import { createPlugin } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { Err, Ok } from "@app/types";

export const sendOnboardingConversationPlugin = createPlugin({
  manifest: {
    id: "send-onboarding-conversation",
    name: "Send onboarding conversation",
    description:
      "Create and send the onboarding conversation to a specific user in this workspace.",
    warning:
      "This overwrites the user's onboarding metadata and may recreate the conversation even if one exists.",
    resourceTypes: ["workspaces"],
    args: {
      userSId: {
        type: "string",
        label: "User sId",
        description:
          "Target user stable id (e.g., usr_xxx) belonging to this workspace.",
      },
    },
  },
  execute: async (auth, _resource, args) => {
    const workspace = auth.workspace();
    if (!workspace) {
      return new Err(new Error("Workspace not found in auth context."));
    }

    const targetUser = await UserResource.fetchById(args.userSId);
    if (!targetUser) {
      return new Err(new Error("User not found."));
    }

    const role = await MembershipResource.getActiveRoleForUserInWorkspace({
      user: targetUser,
      workspace: renderLightWorkspaceType({ workspace }),
    });

    if (role !== "admin") {
      return new Err(new Error("User is not an admin of this workspace."));
    }

    const targetAuth = await Authenticator.fromUserIdAndWorkspaceId(
      targetUser.sId,
      workspace.sId
    );

    const convoRes = await createOnboardingConversationIfNeeded(targetAuth, {
      force: true,
    });

    if (convoRes.isErr()) {
      return new Err(new Error(convoRes.error.api_error.message));
    }

    const conversationId = convoRes.value;

    if (!conversationId) {
      return new Ok({
        display: "text",
        value: "Onboarding conversation was not created (conditions not met).",
      });
    }

    return new Ok({
      display: "textWithLink",
      value: `Onboarding conversation ${conversationId} created.`,
      link: `/w/${workspace.sId}/conversation/${conversationId}`,
      linkText: "Open conversation",
    });
  },
  isApplicableTo: () => true,
});
