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
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

const CUSTOMERIO_HOST = "https://track-eu.customer.io/api/v2";

export class CustomerioServerSideTracking {
  static trackSignup({ user }: { user: UserType }) {
    return CustomerioServerSideTracking._identifyUser({ user });
  }

  static identifyWorkspaces({
    workspaces,
  }: {
    workspaces: Array<
      LightWorkspaceType & { planCode?: string; seats?: number }
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
    role,
  }: {
    user: UserType;
    workspace: LightWorkspaceType;
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
  }

  static async backfillUser({ user }: { user: UserType }) {
    const userMemberships = await MembershipResource.getLatestMemberships({
      users: [user],
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
    workspace: LightWorkspaceType & { planCode?: string; seats?: number };
  }) {
    if (!config.getCustomerIoEnabled()) {
      return;
    }
    const planCode =
      workspace.planCode ??
      (await subscriptionForWorkspace(workspace.sId)).plan.code;
    const seats =
      workspace.seats ?? countActiveSeatsInWorkspaceCached(workspace.sId);

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

    const r = await fetch(`${CUSTOMERIO_HOST}/entity`, {
      method: "POST",
      headers: CustomerioServerSideTracking._headers(),
      body: JSON.stringify({
        identifiers: {
          object_type_id: "1",
          object_id: workspace.sId,
        },
        type: "object",
        action: "identify",
        attributes: {
          name: workspace.name,
          planCode: planCode,
          seats,
        },
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
        id: user.sId,
      },
    };

    if (workspaces) {
      body.cio_relationships = workspaces.map((w) => {
        const relAttributes: Record<string, any> = {
          role: w.role,
        };
        if (w.startAt !== undefined) {
          relAttributes.start_at = w.startAt;
        }
        if (w.endAt !== undefined) {
          relAttributes.end_at = w.endAt;
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

    const r = await fetch(`${CUSTOMERIO_HOST}/entity`, {
      method: "POST",
      headers: CustomerioServerSideTracking._headers(),
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const json = await r.json();
      throw new Error(`Failed to identify user ${user.email}: ${json}`);
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
