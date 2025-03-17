import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
import { createPlugin } from "@app/lib/api/poke/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types";
import { Err, isSupportedEnterpriseConnectionStrategy, Ok } from "@app/types";

interface User {
  auth0Sub: string | null;
  createdAt: Date;
  id: ModelId;
  provider: string | null;
}

interface UserChange {
  email: string;
  ssoUser: User;
  oldestUser: User;
}

export const ssoDedupePlugin = createPlugin({
  manifest: {
    id: "sso-dedupe",
    name: "SSO Dedupe",
    description:
      "Merge duplicate SSO accounts by keeping SSO auth0Sub on oldest user and revoking newer " +
      "memberships",
    resourceTypes: ["workspaces"],
    args: {
      execute: {
        type: "boolean",
        label: "Execute",
        description: "Merge duplicate accounts from SSO",
      },
    },
  },
  execute: async (_auth, workspace, { execute }) => {
    if (!workspace) {
      return new Err(new Error("No workspace specified"));
    }

    // Get all memberships for the workspace.
    const allMemberships = await MembershipResource.getMembershipsForWorkspace({
      workspace,
      includeUser: true,
    });

    // Group by email and filter duplicates and not active memberships.
    const activeMemberships = allMemberships.memberships.filter(
      (m) => !m.isRevoked()
    );

    const emailGroups = activeMemberships.reduce(
      (groups, membership) => {
        const email = membership.user?.email;
        if (!email) {
          return groups;
        }
        if (!groups[email]) {
          groups[email] = [];
        }
        groups[email].push(membership);
        return groups;
      },
      {} as Record<string, typeof activeMemberships>
    );

    const duplicateGroups = Object.values(emailGroups).filter(
      (group) => group.length > 1
    );

    const changes: UserChange[] = [];

    const auth0Client = getAuth0ManagemementClient();

    for (const dupes of duplicateGroups) {
      // Find user with SSO credentials.
      const ssoMembership = dupes.find((m) => {
        const [strategy] = (m.user?.auth0Sub || "").split("|");

        return isSupportedEnterpriseConnectionStrategy(strategy);
      });

      if (!ssoMembership || !ssoMembership.user) {
        continue;
      }

      // Store SSO auth0Sub before any updates.
      const ssoAuth0Sub = ssoMembership.user?.auth0Sub;
      const ssoProvider = ssoMembership.user?.provider;

      if (!ssoAuth0Sub || !ssoProvider) {
        continue;
      }

      // Find oldest user (excluding SSO user).
      const oldestMembership = dupes
        .filter((m) => m.user?.id !== ssoMembership.user?.id)
        .sort((a, b) => {
          const aCreatedAt = a.user?.createdAt;
          const bCreatedAt = b.user?.createdAt;
          if (!aCreatedAt || !bCreatedAt) {
            return 0;
          }
          return aCreatedAt.getTime() - bCreatedAt.getTime();
        })
        .at(0);

      if (!oldestMembership || !oldestMembership.user) {
        continue;
      }

      changes.push({
        email: oldestMembership.user.email,
        ssoUser: {
          id: ssoMembership.user.id,
          createdAt: ssoMembership.user.createdAt,
          auth0Sub: ssoMembership.user.auth0Sub,
          provider: ssoMembership.user.provider,
        },
        oldestUser: {
          id: oldestMembership.user.id,
          createdAt: oldestMembership.user.createdAt,
          auth0Sub: oldestMembership.user.auth0Sub,
          provider: oldestMembership.user.provider,
        },
      });

      if (execute) {
        // Update SSO user.
        const ssoUser = await UserResource.fetchByModelId(
          ssoMembership.user?.id
        );
        if (!ssoUser) {
          continue;
        }

        await ssoUser.updateAuth0Sub({
          sub: `${ssoAuth0Sub}_${Date.now()}`,
          provider: ssoProvider,
        });
        await MembershipResource.revokeMembership({
          user: ssoUser,
          workspace,
        });

        const oldestUser = await UserResource.fetchByModelId(
          oldestMembership.user.id
        );
        if (!oldestUser || !oldestUser.auth0Sub) {
          continue;
        }

        // Delete oldest user from Auth0.
        await auth0Client.users.delete({ id: oldestUser.auth0Sub });

        // Update oldest user with original SSO credentials.
        await oldestUser.updateAuth0Sub({
          sub: ssoAuth0Sub,
          provider: ssoProvider,
        });
      }
    }

    if (!execute) {
      return new Ok({
        display: "json",
        value: {
          changes,
        },
      });
    }

    return new Ok({
      display: "json",
      value: {
        status: "success",
        message: `Processed ${changes.length} duplicate account sets`,
        changes,
      },
    });
  },
});
