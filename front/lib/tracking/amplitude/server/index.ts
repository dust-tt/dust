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

import { isGlobalAgentId } from "@app/lib/api/assistant/global_agents";
import { subscriptionForWorkspace } from "@app/lib/auth";
import { deprecatedGetFirstActionConfiguration } from "@app/lib/deprecated_action_configurations";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import {
  AMPLITUDE_PUBLIC_API_KEY,
  GROUP_TYPE,
} from "@app/lib/tracking/amplitude/config";
import type { Ampli } from "@app/lib/tracking/amplitude/server/generated";
import {
  ampli,
  AssistantCreated,
  DataSourceCreated,
  DataSourceUpdated,
  UserMessagePosted,
} from "@app/lib/tracking/amplitude/server/generated";
import logger from "@app/logger/logger";

let BACKEND_CLIENT: Ampli | null = null;

const { AMPLITUDE_ENABLED } = process.env;

function getBackendClient() {
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

export class AmplitudeServerSideTracking {
  static trackSignup({ user }: { user: UserType }) {
    const amplitude = getBackendClient();
    amplitude.identify(`user-${user.id}`, { email: user.email });
    amplitude.signUp(`user-${user.id}`, {
      insert_id: `signup_${user.id}`,
      time: user.createdAt,
    });
  }

  static async trackUserMemberships({
    user,
  }: {
    user: UserTypeWithWorkspaces;
  }) {
    const amplitude = getBackendClient();
    const groups: string[] = [];

    for (const workspace of user.workspaces) {
      const groupId = workspace.sId;

      // Identify the workspace as a group.
      const subscription = await subscriptionForWorkspace(workspace.sId);
      const memberCount = await countActiveSeatsInWorkspace(workspace.sId);
      const groupProperties = new Identify();
      groupProperties.set("name", workspace.name);
      groupProperties.set("plan", subscription.plan.code);
      groupProperties.set("memberCount", memberCount);
      const rateLimiterKey = `amplitude_workspace:${
        workspace.sId
      }:${JSON.stringify(groupProperties)}`;
      if (
        (await rateLimiter({
          key: rateLimiterKey,
          maxPerTimeframe: 1,
          timeframeSeconds: 60 * 60 * 24,
          logger: logger,
        })) > 0
      ) {
        amplitude.client.groupIdentify(
          GROUP_TYPE,
          workspace.sId,
          groupProperties
        );
      }

      groups.push(groupId);
    }

    // Identify the user with the groups.
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

  static trackUserMessage({
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

  static trackDataSourceCreated({
    user,
    workspace,
    dataSource,
  }: {
    user?: UserType;
    workspace?: WorkspaceType;
    dataSource: DataSourceType;
  }) {
    if (!workspace || !user) {
      return;
    }
    const userId = user.id;
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

  static trackDataSourceUpdated({
    user,
    workspace,
    dataSource,
  }: {
    user?: UserType;
    workspace?: WorkspaceType;
    dataSource: DataSourceType;
  }) {
    if (!user || !workspace) {
      return;
    }
    const userId = user.id;
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

  static trackAssistantCreated({
    user,
    workspace,
    assistant,
  }: {
    user?: UserType;
    workspace?: WorkspaceType;
    assistant: AgentConfigurationType;
  }) {
    if (!workspace || !user) {
      return;
    }
    const userId = user.id;
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

  static trackSubscriptionCreated({
    userId,
    workspaceName,
    workspaceId,
    planCode,
    workspaceSeats,
  }: {
    userId: string;
    workspaceName: string;
    workspaceId: string;
    planCode: string;
    workspaceSeats: number;
  }) {
    const amplitude = getBackendClient();
    amplitude.subscriptionCreated(`user-${userId}`, {
      workspaceId,
      workspaceName,
      plan: planCode,
      workspaceSeats,
    });
  }
}
