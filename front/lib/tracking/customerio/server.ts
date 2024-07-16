import type {
  LightWorkspaceType,
  MembershipRoleType,
  UserType,
} from "@dust-tt/types";
import { rateLimiter } from "@dust-tt/types";
import * as _ from "lodash";

import config from "@app/lib/api/config";
import { subscriptionForWorkspace } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

const CUSTOMERIO_HOST = "https://track-eu.customer.io/api";

export class CustomerioServerSideTracking {
  static trackSignup({ user }: { user: UserType }) {
    return CustomerioServerSideTracking._identifyUser({ user });
  }

  static identifyWorkspaces({
    workspaces,
  }: {
    workspaces: Array<
      LightWorkspaceType & {
        planCode?: string;
        seats?: number;
        subscriptionStartAt?: Date | null;
        requestCancelAt?: Date | null;
      }
    >;
  }) {
    return Promise.all(
      workspaces.map(async (ws) =>
        CustomerioServerSideTracking._identifyWorkspace({ workspace: ws })
      )
    );
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
    await CustomerioServerSideTracking._identifyWorkspace({
      workspace,
    });
    await CustomerioServerSideTracking._identifyUser({
      user,
      workspaces: [
        {
          sId: workspace.sId,
          startAt,
          role,
        },
      ],
    });
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
    await CustomerioServerSideTracking._identifyWorkspace({
      workspace,
    });
    await CustomerioServerSideTracking._identifyUser({
      user,
      workspaces: [
        {
          sId: workspace.sId,
          startAt,
          endAt,
          role,
        },
      ],
    });
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
    await CustomerioServerSideTracking._identifyWorkspace({
      workspace,
    });
    await CustomerioServerSideTracking._identifyUser({
      user,
      workspaces: [
        {
          sId: workspace.sId,
          role,
        },
      ],
    });
    await CustomerioServerSideTracking._trackEvent({
      eventName: "role_updated",
      user,
      workspace,
      eventAttributes: {
        newRole: role,
        previousRole,
      },
    });
  }

  static async backfillUser({ user }: { user: UserType }) {
    const userRes = await UserResource.fetchById(user.sId);

    if (!userRes) {
      logger.error(
        { userId: user.sId },
        "Failed to backfill user on Customer.io"
      );
      return;
    }

    const userMemberships = await MembershipResource.getLatestMemberships({
      users: [userRes],
    });

    const workspaces = _.keyBy(
      await Workspace.findAll({
        where: {
          id: userMemberships.map((m) => m.workspaceId),
        },
      }),
      "id"
    );

    // Identify all workspace objects.
    const chunks = _.chunk(userMemberships, 8);
    for (const c of chunks) {
      await Promise.all(
        c.map(async (membership) => {
          const ws = renderLightWorkspaceType({
            workspace: workspaces[membership.workspaceId],
          });
          await CustomerioServerSideTracking._identifyWorkspace({
            workspace: ws,
          });
        })
      );
    }

    await CustomerioServerSideTracking._identifyUser({
      user,
      workspaces: userMemberships.map((m) => ({
        sId: workspaces[m.workspaceId].sId,
        startAt: m.startAt,
        endAt: m.endAt,
        role: m.role,
      })),
    });
  }

  static async _identifyWorkspace({
    workspace,
  }: {
    workspace: LightWorkspaceType & {
      planCode?: string;
      seats?: number;
      subscriptionStartAt?: Date | null;
      requestCancelAt?: Date | null;
    };
  }) {
    if (!config.getCustomerIoEnabled()) {
      return;
    }
    const planCode =
      workspace.planCode ??
      (await subscriptionForWorkspace(workspace)).plan.code;
    const seats =
      workspace.seats ??
      (await countActiveSeatsInWorkspaceCached(workspace.sId));

    // Unless the info changes, we only identify a given workspace once per day.
    const rateLimiterKey = `customerio_workspace:${workspace.sId}:${workspace.name}:${planCode}:${seats}`;
    if (
      !(await rateLimiter({
        key: rateLimiterKey,
        maxPerTimeframe: 1,
        timeframeSeconds: 60 * 60 * 24,
        logger: logger,
      }))
    ) {
      return;
    }

    const attributes: Record<string, string | number | null> = {
      name: workspace.name,
      planCode,
      seats,
    };

    if (workspace.subscriptionStartAt !== undefined) {
      attributes.subscriptionStartAt = workspace.subscriptionStartAt
        ? Math.floor(workspace.subscriptionStartAt.getTime() / 1000)
        : null;
    }
    if (workspace.requestCancelAt !== undefined) {
      attributes.requestCancelAt = workspace.requestCancelAt
        ? Math.floor(workspace.requestCancelAt.getTime() / 1000)
        : null;
    }

    const r = await fetch(`${CUSTOMERIO_HOST}/v2/entity`, {
      method: "POST",
      headers: CustomerioServerSideTracking._headers(),
      body: JSON.stringify({
        identifiers: {
          object_type_id: "1",
          object_id: workspace.sId,
        },
        type: "object",
        action: "identify",
        attributes,
      }),
    });

    if (!r.ok) {
      throw new Error(`Failed to identify workspace ${workspace.sId}`);
    }
  }

  static async _identifyUser({
    user,
    workspaces,
  }: {
    user: UserType;
    workspaces?: Array<{
      sId: string;
      startAt?: Date;
      endAt?: Date | null;
      role: MembershipRoleType;
    }>;
  }) {
    if (!config.getCustomerIoEnabled()) {
      return;
    }

    const body: Record<string, any> = {
      identifiers: {
        email: user.email,
      },
      type: "person",
      action: "identify",
      attributes: {
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        created_at: Math.floor(user.createdAt / 1000),
        sid: user.sId,
      },
    };

    if (workspaces) {
      body.cio_relationships = workspaces.map((w) => {
        const relAttributes: Record<string, any> = {
          role: w.role,
        };
        if (w.startAt !== undefined) {
          relAttributes.start_at = Math.floor(w.startAt.getTime() / 1000);
        }
        if (w.endAt !== undefined) {
          relAttributes.end_at = w.endAt
            ? Math.floor(w.endAt.getTime() / 1000)
            : null;
        }
        return {
          identifiers: {
            object_type_id: "1",
            object_id: w.sId,
          },
          relationship_attributes: relAttributes,
        };
      });
    }

    const r = await fetch(`${CUSTOMERIO_HOST}/v2/entity`, {
      method: "POST",
      headers: CustomerioServerSideTracking._headers(),
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const json = await r.json();
      throw new Error(`Failed to identify user ${user.email}: ${json}`);
    }
  }

  static async deleteUser({ user }: { user: UserType }) {
    if (!config.getCustomerIoEnabled()) {
      return;
    }

    const r = await fetch(`${CUSTOMERIO_HOST}/v2/entity`, {
      method: "POST",
      headers: CustomerioServerSideTracking._headers(),
      body: JSON.stringify({
        identifiers: {
          email: user.email,
        },
        type: "person",
        action: "delete",
      }),
    });

    if (!r.ok) {
      const json = await r.json();
      throw new Error(`Failed to delete user ${user.email}: ${json}`);
    }
  }

  static async deleteWorkspace({
    workspace,
  }: {
    workspace: LightWorkspaceType;
  }) {
    if (!config.getCustomerIoEnabled()) {
      return;
    }

    const r = await fetch(`${CUSTOMERIO_HOST}/v2/entity`, {
      method: "POST",
      headers: CustomerioServerSideTracking._headers(),
      body: JSON.stringify({
        identifiers: {
          object_type_id: "1",
          object_id: workspace.sId,
        },
        type: "object",
        action: "delete",
      }),
    });

    if (!r.ok) {
      const json = await r.json();
      throw new Error(`Failed to delete workspace ${workspace.sId}: ${json}`);
    }
  }

  static async _trackEvent({
    user,
    workspace,
    eventName,
    eventAttributes,
  }: {
    user: UserType;
    workspace?: LightWorkspaceType;
    eventName: string;
    eventAttributes?: Record<string, any>;
  }) {
    if (!config.getCustomerIoEnabled()) {
      return;
    }

    const eventData: Record<string, any> = { ...eventAttributes };
    if (workspace) {
      eventData.workspace_id = workspace.sId;
      eventData.workspace_name = workspace.name;
    }

    const body: Record<string, any> = {
      name: eventName,
      data: eventAttributes,
    };

    const r = await fetch(
      `${CUSTOMERIO_HOST}/v1/customers/${encodeURIComponent(
        user.email
      )}/events`,
      {
        method: "POST",
        headers: CustomerioServerSideTracking._headers(),
        body: JSON.stringify(body),
      }
    );

    if (!r.ok) {
      const json = await r.json();
      throw new Error(`Failed to track event ${eventName}: ${json}`);
    }
  }

  static _headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(
        `${config.getCustomerIoSiteId()}:${config.getCustomerIoApiKey()}`
      ).toString("base64")}`,
    };
  }
}
