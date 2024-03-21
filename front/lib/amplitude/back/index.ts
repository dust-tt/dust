import { Identify } from "@amplitude/analytics-node";
import type {
  ModelId,
  UserMessageType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";

import type { Ampli } from "@app/lib/amplitude/back/generated";
import { ampli, UserMessagePosted } from "@app/lib/amplitude/back/generated";
import {
  AMPLITUDE_PUBLIC_API_KEY,
  GROUP_TYPE,
} from "@app/lib/amplitude/config";
import { isGlobalAgentId } from "@app/lib/api/assistant/global_agents";
import { subscriptionForWorkspace } from "@app/lib/auth";
import { Membership } from "@app/lib/models";
import { User, Workspace } from "@app/lib/models";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/workspace_usage";

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

export async function trackUserMemberships(userId: ModelId) {
  const amplitude = getBackendClient();
  const user = await User.findByPk(userId);
  const memberships = await Membership.findAll({
    where: {
      userId: userId,
    },
  });
  const groups: string[] = [];
  for (const membership of memberships) {
    const workspace = await Workspace.findByPk(membership.workspaceId);
    if (user && workspace) {
      const groupId = workspace.sId;

      await populateWorkspaceProperties(workspace);
      groups.push(groupId);
    }
  }
  if (groups.length > 0) {
    amplitude.client.setGroup(GROUP_TYPE, groups, {
      user_id: `user-${userId}`,
    });
  }
}

// Workspace does not need to be populated very often,
// so this is a cheap hack to avoid populating the same workspace multiple times.
// This will probably change over time when we have a more complicated
// workspace tracking setup.
const alreadyPopulatedWorkspaces: Set<string> = new Set();
export async function populateWorkspaceProperties(workspace: Workspace) {
  if (alreadyPopulatedWorkspaces.has(workspace.sId)) {
    return;
  }
  const amplitude = getBackendClient();

  const subscription = await subscriptionForWorkspace(workspace);
  const memberCount = await countActiveSeatsInWorkspace(workspace.sId);
  const groupProperties = new Identify();
  groupProperties.set("name", workspace.name);
  groupProperties.set("plan", subscription.plan.code);
  groupProperties.set("memberCount", memberCount);
  amplitude.client.groupIdentify(GROUP_TYPE, workspace.sId, groupProperties);
  alreadyPopulatedWorkspaces.add(workspace.sId);
}

export function trackSignup(user: UserType) {
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
  const event = new UserMessagePosted({
    messageId: userMessage.sId,
    workspaceId: workspace.sId,
    workspaceName: workspace.name,
    version: userMessage.version,
    mentions: userMessage.mentions.map((mention) => mention.configurationId),
    mentionsCount: userMessage.mentions.length,
    conversationId,
    // We are mostly interested in tracking the usage of non global agents,
    // so if there is at least one non global agent in the list, that's enough to set
    // isGlobalAgent to false.
    isGlobalAgent: !(
      userMessage.mentions.filter(
        (mention) => isGlobalAgentId(mention.configurationId) === false
      ).length > 0
    ),
  });

  amplitude.track(
    userId,
    { ...event, groups: { [GROUP_TYPE]: workspace.sId } },
    {
      time: userMessage.created,
      insert_id: `user_message_${userMessage.sId}-${userMessage.version}`,
    }
  );
}
