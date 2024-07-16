import type {
  AgentConfigurationType,
  AgentMessageType,
  DataSourceType,
  LightWorkspaceType,
  MembershipRoleType,
  UserMessageType,
  UserType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";
import * as _ from "lodash";

import { subscriptionForWorkspaces } from "@app/lib/auth";
import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { AmplitudeServerSideTracking } from "@app/lib/tracking/amplitude/server";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import logger from "@app/logger/logger";

export class ServerSideTracking {
  static trackSignup({ user }: { user: UserType }) {
    AmplitudeServerSideTracking.trackSignup({ user });
  }

  static async trackGetUser({ user }: { user: UserTypeWithWorkspaces }) {
    try {
      const subscriptionByWorkspaceId = await subscriptionForWorkspaces(
        user.workspaces
      );

      const seatsByWorkspaceId = _.keyBy(
        await Promise.all(
          user.workspaces.map(async (workspace) => {
            const seats = await countActiveSeatsInWorkspaceCached(
              workspace.sId
            );
            return { sId: workspace.sId, seats };
          })
        ),
        "sId"
      );

      const promises: Promise<unknown>[] = [];

      // We overwrite every user membership on Amplitude everytime someone logs in.
      promises.push(
        AmplitudeServerSideTracking.trackUserMemberships({
          user: {
            ...user,
            workspaces: user.workspaces.map((ws) => ({
              ...ws,
              planCode: subscriptionByWorkspaceId[ws.sId].plan.code,
              seats: seatsByWorkspaceId[ws.sId].seats,
            })),
          },
        }).catch((err) => {
          logger.error(
            { userId: user.sId, err },
            "Failed to track user memberships on Amplitude"
          );
        })
      );

      // We identify all of the user's workspaces on Customer.io everytime someone logs in,
      // so we keep subscription info up to date.
      // The actual customer.io call is rate limited to 1 call per day with the same data.
      const workspacesToTrackOnCustomerIo = user.workspaces
        .map((ws) => {
          const subscriptionStartInt =
            subscriptionByWorkspaceId[ws.sId].startDate;
          const subscriptionStartAt = subscriptionStartInt
            ? new Date(subscriptionStartInt)
            : null;

          const requestCancelAtInt =
            subscriptionByWorkspaceId[ws.sId].requestCancelAt;
          const requestCancelAt = requestCancelAtInt
            ? new Date(requestCancelAtInt)
            : null;

          return {
            ...ws,
            planCode: subscriptionByWorkspaceId[ws.sId].plan.code,
            seats: seatsByWorkspaceId[ws.sId].seats,
            subscriptionStartAt,
            requestCancelAt,
          };
        })
        .filter((ws) => ws.planCode !== FREE_TEST_PLAN_CODE);
      if (workspacesToTrackOnCustomerIo.length > 0) {
        promises.push(
          CustomerioServerSideTracking.identifyWorkspaces({
            workspaces: workspacesToTrackOnCustomerIo,
          }).catch((err) => {
            logger.error(
              { userId: user.sId, err },
              "Failed to identify workspaces on Customer.io"
            );
          })
        );
      }

      await Promise.all(promises);
    } catch (err) {
      logger.error(
        { userId: user.sId, err },
        "Failed to track user memberships"
      );
    }
  }

  static async trackUserMessage({
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
    try {
      await AmplitudeServerSideTracking.trackUserMessage({
        userMessage,
        workspace,
        userId,
        conversationId,
        agentMessages,
      });
    } catch (err) {
      logger.error(
        { userId, workspaceId: workspace.sId, err },
        "Failed to track user message on Amplitude"
      );
    }
  }

  static async trackDataSourceCreated({
    user,
    workspace,
    dataSource,
  }: {
    user?: UserType;
    workspace?: WorkspaceType;
    dataSource: DataSourceType;
  }) {
    try {
      await AmplitudeServerSideTracking.trackDataSourceCreated({
        user,
        workspace,
        dataSource,
      });
    } catch (err) {
      logger.error(
        { userId: user?.sId, workspaceId: workspace?.sId, err },
        "Failed to track data source created on Amplitude"
      );
    }
  }

  static async trackDataSourceUpdated({
    user,
    workspace,
    dataSource,
  }: {
    user?: UserType;
    workspace?: WorkspaceType;
    dataSource: DataSourceType;
  }) {
    try {
      await AmplitudeServerSideTracking.trackDataSourceUpdated({
        user,
        workspace,
        dataSource,
      });
    } catch (err) {
      logger.error(
        { userId: user?.sId, workspaceId: workspace?.sId, err },
        "Failed to track data source updated on Amplitude"
      );
    }
  }

  static async trackAssistantCreated({
    user,
    workspace,
    assistant,
  }: {
    user?: UserType;
    workspace?: WorkspaceType;
    assistant: AgentConfigurationType;
  }) {
    try {
      await AmplitudeServerSideTracking.trackAssistantCreated({
        user,
        workspace,
        assistant,
      });
    } catch (err) {
      logger.error(
        { userId: user?.sId, workspaceId: workspace?.sId, err },
        "Failed to track assistant created on Amplitude"
      );
    }
  }

  static async trackSubscriptionCreated({
    userId,
    workspace,
    planCode,
    workspaceSeats,
    subscriptionStartAt,
  }: {
    userId: string;
    workspace: LightWorkspaceType;
    planCode: string;
    workspaceSeats: number;
    subscriptionStartAt: Date;
  }) {
    return Promise.all([
      AmplitudeServerSideTracking.trackSubscriptionCreated({
        userId,
        workspace,
        planCode,
        workspaceSeats,
      }),
      CustomerioServerSideTracking.identifyWorkspaces({
        workspaces: [
          {
            ...workspace,
            planCode,
            seats: workspaceSeats,
            subscriptionStartAt,
          },
        ],
      }),
    ]);
  }

  static async trackSubscriptionRequestCancel({
    workspace,
    requestCancelAt,
  }: {
    workspace: LightWorkspaceType;
    requestCancelAt: Date;
  }) {
    return CustomerioServerSideTracking.identifyWorkspaces({
      workspaces: [
        {
          ...workspace,
          requestCancelAt,
        },
      ],
    });
  }

  static async trackSubscriptionReactivated({
    workspace,
  }: {
    workspace: LightWorkspaceType;
  }) {
    return CustomerioServerSideTracking.identifyWorkspaces({
      workspaces: [
        {
          ...workspace,
          requestCancelAt: null,
        },
      ],
    });
  }

  static async trackCreateMembership({
    user,
    workspace,
    role,
    startAt,
  }: {
    user: UserType;
    workspace: LightWorkspaceType;
    role: MembershipRoleType;
    startAt: Date;
  }) {
    try {
      await CustomerioServerSideTracking.trackCreateMembership({
        user,
        workspace,
        role,
        startAt,
      });
    } catch (err) {
      logger.error(
        { userId: user.sId, workspaceId: workspace.sId, err },
        "Failed to track create membership on Customer.io"
      );
    }
  }

  static async trackRevokeMembership({
    user,
    workspace,
    role,
    startAt,
    endAt,
  }: {
    user: UserType;
    workspace: LightWorkspaceType;
    role: MembershipRoleType;
    startAt: Date;
    endAt: Date;
  }) {
    try {
      await CustomerioServerSideTracking.trackRevokeMembership({
        user,
        workspace,
        role,
        startAt,
        endAt,
      });
    } catch (err) {
      logger.error(
        { userId: user.sId, workspaceId: workspace.sId, err },
        "Failed to track revoke membership on Customer.io"
      );
    }
  }

  static async trackUpdateMembershipRole({
    user,
    workspace,
    previousRole,
    role,
  }: {
    user: UserType;
    workspace: LightWorkspaceType;
    previousRole: MembershipRoleType;
    role: MembershipRoleType;
  }) {
    try {
      await CustomerioServerSideTracking.trackUpdateMembershipRole({
        user,
        workspace,
        previousRole,
        role,
      });
    } catch (err) {
      logger.error(
        { userId: user.sId, workspaceId: workspace.sId, err },
        "Failed to track update membership role on Customer.io"
      );
    }
  }
}
