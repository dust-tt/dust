import type {
  LightWorkspaceType,
  MembershipRoleType,
  UserType,
} from "@dust-tt/types";
import * as _ from "lodash";

import { subscriptionForWorkspace } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

const {
  CUSTOMERIO_ENABLED,
  CUSTOMERIO_SITE_ID = "",
  CUSTOMERIO_API_KEY = "",
} = process.env;

const CUSTOMERIO_HOST = "https://track-eu.customer.io/api/v2";

function isCustomerioEnabled() {
  return CUSTOMERIO_ENABLED === "true";
}

export class CustomerioServerSideTracking {
  static trackSignup({ user }: { user: UserType }) {
    if (!isCustomerioEnabled()) {
      return;
    }
    return CustomerioServerSideTracking._identifyUser({ user });
  }

  static async trackUserMemberships({ user }: { user: UserType }) {
    if (!isCustomerioEnabled()) {
      return;
    }
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
    workspace: LightWorkspaceType;
  }) {
    if (!isCustomerioEnabled()) {
      return;
    }
    const subscription = await subscriptionForWorkspace(workspace.sId);
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
          planCode: subscription.plan.code,
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
      startAt: Date;
      endAt?: Date | null;
      role: MembershipRoleType;
    }>;
  }) {
    if (!isCustomerioEnabled()) {
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
        created_at: user.createdAt,
      },
    };

    if (workspaces) {
      body.cio_relationships = workspaces.map((w) => ({
        identifiers: {
          object_type_id: "1",
          object_id: w.sId,
        },
        relationship_attributes: {
          role: w.role,
          start_at: w.startAt,
          end_at: w.endAt,
        },
      }));
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
        `${CUSTOMERIO_SITE_ID}:${CUSTOMERIO_API_KEY}`
      ).toString("base64")}`,
    };
  }
}
