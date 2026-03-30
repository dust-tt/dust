import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { POKE_TOOLS_METADATA } from "@app/lib/api/actions/servers/poke/metadata";
import {
  GET_WORKSPACE_CREDITS_TOOL_NAME,
  GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME,
  GET_WORKSPACE_MEMBERS_TOOL_NAME,
  GET_WORKSPACE_PLAN_TOOL_NAME,
  GET_WORKSPACE_SPACES_TOOL_NAME,
} from "@app/lib/api/actions/servers/poke/metadata";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import config from "@app/lib/api/config";
import { getWorkspaceCreationDate } from "@app/lib/api/workspace";
import { getFeatureFlags } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Err } from "@app/types/shared/result";
import { format } from "date-fns/format";

const THIRTY_DAYS_MS = -30 * 24 * 60 * 60 * 1000;

type WorkspaceHandlers = Pick<
  ToolHandlers<typeof POKE_TOOLS_METADATA>,
  | typeof GET_WORKSPACE_PLAN_TOOL_NAME
  | typeof GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME
  | typeof GET_WORKSPACE_MEMBERS_TOOL_NAME
  | typeof GET_WORKSPACE_SPACES_TOOL_NAME
  | typeof GET_WORKSPACE_CREDITS_TOOL_NAME
>;

export const workspaceHandlers: WorkspaceHandlers = {
  [GET_WORKSPACE_PLAN_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_PLAN_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }
    const targetAuth = targetAuthResult.value;

    const activeSubscription = targetAuth.subscription();
    if (!activeSubscription) {
      return new Err(
        new MCPError("No active subscription found for workspace.", {
          tracked: false,
        })
      );
    }

    const [subscriptionResources, workspaceResource, workspaceCreationDate] =
      await Promise.all([
        SubscriptionResource.fetchByAuthenticator(targetAuth),
        WorkspaceResource.fetchById(workspace_id),
        getWorkspaceCreationDate(workspace_id),
      ]);

    const subscriptions = subscriptionResources.map((s) => s.toJSON());
    const verifiedDomains = workspaceResource
      ? await workspaceResource.getVerifiedDomains()
      : [];

    return jsonResponse({
      activeSubscription,
      subscriptionHistory: subscriptions,
      workspaceCreationDay: format(workspaceCreationDate, "yyyy-MM-dd"),
      verifiedDomains,
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}`,
    });
  },

  [GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }

    const featureFlags = await getFeatureFlags(targetAuthResult.value);

    return jsonResponse({
      workspace_id,
      featureFlags,
      count: featureFlags.length,
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}`,
    });
  },

  [GET_WORKSPACE_MEMBERS_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_MEMBERS_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }
    const targetAuth = targetAuthResult.value;
    const workspace = targetAuth.getNonNullableWorkspace();

    const [{ memberships }, pendingInvitations, membersCount] =
      await Promise.all([
        MembershipResource.getLatestMemberships({ workspace }),
        MembershipInvitationResource.getPendingInvitations(targetAuth, {
          includeExpired: true,
        }),
        MembershipResource.getMembersCountForWorkspace({
          workspace,
          activeOnly: true,
        }),
      ]);

    // Fetch user details for all memberships.
    const userIds = memberships.map((m) => m.userId);
    const users = await UserResource.fetchByModelIds(userIds);
    const usersById = new Map(users.map((u) => [u.id, u]));

    const members = memberships.map((m) => {
      const user = usersById.get(m.userId);
      return {
        userId: user?.sId ?? null,
        email: user?.email ?? null,
        role: m.role,
        startAt: m.startAt?.toISOString() ?? null,
        endAt: m.endAt?.toISOString() ?? null,
      };
    });

    const invitations = pendingInvitations.map((inv) => ({
      email: inv.inviteEmail,
      status: inv.status,
      initialRole: inv.initialRole,
      createdAt: inv.createdAt,
    }));

    return jsonResponse({
      workspace_id,
      activeMembersCount: membersCount,
      members,
      pendingInvitations: invitations,
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}`,
    });
  },

  [GET_WORKSPACE_SPACES_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_SPACES_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }

    const spaces = await SpaceResource.listWorkspaceSpaces(
      targetAuthResult.value
    );

    return jsonResponse({
      workspace_id,
      count: spaces.length,
      spaces: spaces.map((s) => s.toJSON()),
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}`,
    });
  },

  [GET_WORKSPACE_CREDITS_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_CREDITS_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }
    const targetAuth = targetAuthResult.value;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);

    const [credits, excessCreditsLast30DaysMicroUsd] = await Promise.all([
      CreditResource.listAll(targetAuth),
      CreditResource.sumExcessCreditsInPeriod(targetAuth, {
        periodStart: thirtyDaysAgo,
        periodEnd: now,
      }),
    ]);

    return jsonResponse({
      workspace_id,
      credits: credits.map((c) => c.toJSONForAdmin()),
      excessCreditsLast30DaysMicroUsd,
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}`,
    });
  },
};
