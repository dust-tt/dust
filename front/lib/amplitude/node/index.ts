import { Identify } from "@amplitude/analytics-node";
import type {
  AgentConfigurationType,
  AgentMessageType,
  DataSourceType,
  UserMessageType,
  UserType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";
import { rateLimiter, removeNulls } from "@dust-tt/types";

import { deprecatedGetFirstActionConfiguration } from "@app/lib/action_configurations";
import {
  AMPLITUDE_PUBLIC_API_KEY,
  GROUP_TYPE,
} from "@app/lib/amplitude/config";
import type { Ampli } from "@app/lib/amplitude/node/generated";
import {
  ampli,
  AssistantCreated,
  DataSourceCreated,
  DataSourceUpdated,
  UserMessagePosted,
} from "@app/lib/amplitude/node/generated";
import { isGlobalAgentId } from "@app/lib/api/assistant/global_agents";
import type { Authenticator } from "@app/lib/auth";
import { subscriptionForWorkspace } from "@app/lib/auth";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import logger from "@app/logger/logger";

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

export async function trackUserMemberships(user: UserTypeWithWorkspaces) {
  const amplitude = getBackendClient();
  const groups: string[] = [];
  for (const workspace of user.workspaces) {
    const groupId = workspace.sId;

    await populateWorkspaceProperties(workspace);
    groups.push(groupId);
  }

  if (groups.length > 0) {
    const rateLimiterKey = `amplitude_groups:${user.id}:${groups
      .sort()
      .join("_")}`;
    if (
      (await rateLimiter({
        key: rateLimiterKey,
        maxPerTimeframe: 1,
        timeframeSeconds: 60 * 60 * 24,
        logger: logger,
      })) > 0
    ) {
      amplitude.client.setGroup(GROUP_TYPE, groups, {
        user_id: `user-${user.id}`,
      });
    }
  }
}
export async function populateWorkspaceProperties(
  workspace: UserTypeWithWorkspaces["workspaces"][number]
) {
  const amplitude = getBackendClient();

  const subscription = await subscriptionForWorkspace(workspace.sId);
  const memberCount = await countActiveSeatsInWorkspace(workspace.sId);
  const groupProperties = new Identify();
  groupProperties.set("name", workspace.name);
  groupProperties.set("plan", subscription.plan.code);
  groupProperties.set("memberCount", memberCount);

  const rateLimiterKey = `amplitude_workspace:${workspace.sId}:${JSON.stringify(
    groupProperties
  )}`;
  if (
    (await rateLimiter({
      key: rateLimiterKey,
      maxPerTimeframe: 1,
      timeframeSeconds: 60 * 60 * 24,
      logger: logger,
    })) > 0
  ) {
    amplitude.client.groupIdentify(GROUP_TYPE, workspace.sId, groupProperties);
  }
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
  agentMessages,
}: {
  userMessage: UserMessageType;
  workspace: WorkspaceType;
  userId: string;
  conversationId: string;
  agentMessages: AgentMessageType[];
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
    generationModels: removeNulls(
      agentMessages.map(
        (am) => am.configuration.generation?.model.modelId || null
      )
    ),
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

export function trackDataSourceCreated(
  auth: Authenticator,
  {
    dataSource,
  }: {
    dataSource: DataSourceType;
  }
) {
  const userId = auth.user()?.id;
  const workspace = auth.workspace();
  if (!workspace || !userId) {
    return;
  }
  const amplitude = getBackendClient();
  const event = new DataSourceCreated({
    dataSourceName: dataSource.name,
    dataSourceProvider: dataSource.connectorProvider || "",
    workspaceName: workspace.name,
    workspaceId: workspace.sId,
    assistantDefaultSelected: dataSource.assistantDefaultSelected,
  });

  amplitude.track(
    `user-${userId}`,
    { ...event, groups: { [GROUP_TYPE]: workspace.sId } },
    {
      time: dataSource.createdAt,
      insert_id: `data_source_created_${dataSource.id}`,
    }
  );
}

export function trackDataSourceUpdated(
  auth: Authenticator,
  {
    dataSource,
  }: {
    dataSource: DataSourceType;
  }
) {
  const userId = auth.user()?.id;
  const workspace = auth.workspace();
  if (!workspace || !userId) {
    return;
  }
  const amplitude = getBackendClient();
  const event = new DataSourceUpdated({
    dataSourceName: dataSource.name,
    dataSourceProvider: dataSource.connectorProvider || "",
    workspaceName: workspace.name,
    workspaceId: workspace.sId,
    assistantDefaultSelected: dataSource.assistantDefaultSelected,
  });

  amplitude.track(
    `user-${userId}`,
    { ...event, groups: { [GROUP_TYPE]: workspace.sId } },
    {
      time: Date.now(),
    }
  );
}

export function trackAssistantCreated(
  auth: Authenticator,
  { assistant }: { assistant: AgentConfigurationType }
) {
  const userId = auth.user()?.id;
  const workspace = auth.workspace();
  if (!workspace || !userId) {
    return;
  }
  const amplitude = getBackendClient();
  const action = deprecatedGetFirstActionConfiguration(assistant);
  const event = new AssistantCreated({
    assistantId: assistant.sId,
    assistantName: assistant.name,
    workspaceName: workspace.name,
    workspaceId: workspace.sId,
    assistantScope: assistant.scope,
    assistantActionType: action?.type || "",
    assistantVersion: assistant.version,
    assistantModel: assistant.generation?.model.modelId,
  });
  amplitude.track(
    `user-${userId}`,
    { ...event, groups: { [GROUP_TYPE]: workspace.sId } },
    {
      time: assistant.versionCreatedAt
        ? new Date(assistant.versionCreatedAt).getTime()
        : Date.now(),
      insert_id: `assistant_created_${assistant.sId}`,
    }
  );
}
