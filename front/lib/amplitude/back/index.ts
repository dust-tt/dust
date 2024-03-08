import type { UserMessageType, UserType, WorkspaceType } from "@dust-tt/types";

import type { Ampli } from "@app/lib/amplitude/back/generated";
import { ampli } from "@app/lib/amplitude/back/generated";
import { AMPLITUDE_PUBLIC_API_KEY } from "@app/lib/amplitude/config";
import type { Membership } from "@app/lib/models";
import { User, Workspace } from "@app/lib/models";

let BACKEND_CLIENT: Ampli | null = null;

const { AMPLITUDE_ENABLED } = process.env;

export function getBackendClient() {
  if (BACKEND_CLIENT) {
    return BACKEND_CLIENT;
  }

  const disabled = !(AMPLITUDE_ENABLED === "true");
  ampli.load({
    // The environment property is a depreacted value, but still needed by the SDK. We don't use it.
    environment: "dustprod",
    client: {
      apiKey: AMPLITUDE_PUBLIC_API_KEY,
    },
    disabled: disabled,
  });
  BACKEND_CLIENT = ampli;

  return BACKEND_CLIENT;
}

export async function trackWorkspaceMember(membership: Membership) {
  const amplitude = getBackendClient();
  const user = await User.findByPk(membership.userId);
  const workspace = await Workspace.findByPk(membership.workspaceId);
  if (user && workspace) {
    amplitude.client.setGroup("GroupWorkspaceId", workspace.sId, {
      user_id: `user-${user.id}`,
      time: membership.createdAt.getTime(),
      insert_id: `membership_${user.id}-${workspace.sId}_v2`,
    });
  }
}

export function trackUser(user: UserType) {
  const amplitude = getBackendClient();
  amplitude.identify(`user-${user.id}`, { email: user.email });
  amplitude.signUp(`user-${user.id}`, {
    insert_id: `signup_${user.id}`,
    time: user.createdAt,
  });
}

export function trackUserMessage({
  userMessage,
  workspace,
  userId,
  conversationId,
}: {
  userMessage: UserMessageType;
  workspace: WorkspaceType;
  userId: string;
  conversationId: string;
}) {
  const amplitude = getBackendClient();
  amplitude.userMessagePosted(
    userId,
    {
      messageId: userMessage.sId,
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      version: userMessage.version,
      mentions: userMessage.mentions.map((mention) => mention.configurationId),
      mentionsCount: userMessage.mentions.length,
      conversationId,
    },
    {
      time: userMessage.created,
      insert_id: `user_message_${userMessage.sId}-${userMessage.version}`,
    }
  );
}
