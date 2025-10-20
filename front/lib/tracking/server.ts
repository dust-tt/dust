import * as _ from "lodash";

import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import {
  countActiveSeatsInWorkspaceCached,
} from "@app/lib/plans/usage/seats";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import logger from "@app/logger/logger";
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
} from "@app/types";
import type { JobType } from "@app/types/job_type";

import type { UserResource } from "../resources/user_resource";

export class ServerSideTracking {
  static trackSignup(args: { user: UserType }) {
    // Do nothing for now
    args;
  }

  static async trackGetUser({ user }: { user: UserTypeWithWorkspaces }) {
    try {
      const subscriptionByWorkspaceId =
        await SubscriptionResource.fetchActiveByWorkspaces(user.workspaces);

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
            planCode: subscriptionByWorkspaceId[ws.sId].getPlan().code,
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

  static trackUserMessage(args: {
    userMessage: UserMessageType;
    workspace: WorkspaceType;
    userId: string;
    conversationId: string;
    agentMessages: AgentMessageType[];
  }) {
    // Do nothing for now
    args;
  }

  static trackDataSourceCreated(args: {
    user?: UserResource;
    workspace?: WorkspaceType;
    dataSource: DataSourceType;
  }) {
    // Do nothing for now
    args;
  }

  static trackDataSourceUpdated(args: {
    user?: UserResource;
    workspace?: WorkspaceType;
    dataSource: DataSourceType;
  }) {
    // Do nothing for now
    args;
  }

  static trackAssistantCreated(args: {
    user?: UserResource;
    workspace?: WorkspaceType;
    assistant: AgentConfigurationType;
  }) {
    // Do nothing for now
    args;
  }

  static async trackSubscriptionCreated({
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
    return CustomerioServerSideTracking.identifyWorkspaces({
      workspaces: [
        {
          ...workspace,
          planCode,
          seats: workspaceSeats,
          subscriptionStartAt,
        },
      ],
    });
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

  static async trackUpdateUser({
    user,
    workspace,
    role,
    jobType,
  }: {
    user: UserType;
    workspace: LightWorkspaceType;
    role: MembershipRoleType;
    jobType?: JobType;
  }) {
    try {
      await CustomerioServerSideTracking.trackUpdateUser({
        user,
        workspace,
        role,
        jobType,
      });
    } catch (err) {
      logger.error(
        { userId: user.sId, workspaceId: workspace.sId, err },
        "Failed to track update user onboardingInfo on Customer.io"
      );
    }
  }
}
