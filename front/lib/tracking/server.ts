import type {
  AgentConfigurationType,
  AgentMessageType,
  DataSourceType,
  UserMessageType,
  UserType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";

import { AmplitudeServerSideTracking } from "@app/lib/tracking/amplitude/server";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import logger from "@app/logger/logger";

export class ServerSideTracking {
  static trackSignup({ user }: { user: UserType }) {
    AmplitudeServerSideTracking.trackSignup({ user });
    void CustomerioServerSideTracking.trackSignup({ user });
  }

  static async trackUserMemberships({
    user,
  }: {
    user: UserTypeWithWorkspaces;
  }) {
    AmplitudeServerSideTracking.trackUserMemberships({ user }).catch((err) => {
      logger.error(
        { userId: user.sId, err },
        "Failed to track user memberships on Amplitude"
      );
    });
    CustomerioServerSideTracking.trackUserMemberships({ user }).catch((err) => {
      logger.error(
        { userId: user.sId, err },
        "Failed to track user memberships on Customer.io"
      );
    });
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
    return AmplitudeServerSideTracking.trackUserMessage({
      userMessage,
      workspace,
      userId,
      conversationId,
      agentMessages,
    });
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
    return AmplitudeServerSideTracking.trackDataSourceCreated({
      user,
      workspace,
      dataSource,
    });
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
    return AmplitudeServerSideTracking.trackDataSourceUpdated({
      user,
      workspace,
      dataSource,
    });
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
    return AmplitudeServerSideTracking.trackAssistantCreated({
      user,
      workspace,
      assistant,
    });
  }

  static async trackSubscriptionCreated({
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
    return AmplitudeServerSideTracking.trackSubscriptionCreated({
      userId,
      workspaceName,
      workspaceId,
      planCode,
      workspaceSeats,
    });
  }
}
