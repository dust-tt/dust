import config from "@app/lib/api/config";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import type {
  SandboxExecTokenPayload,
  SandboxFunctionInvocationTokenPayload,
  SandboxTokenPayload,
} from "@app/lib/api/sandbox/access_tokens";
import {
  isSandboxExecTokenPayload,
  isSandboxFileSystemTokenPayload,
  isSandboxFunctionInvocationTokenPayload,
  SANDBOX_TOKEN_PREFIX,
} from "@app/lib/api/sandbox/access_tokens";
import type { WorkOSJwtPayload } from "@app/lib/api/workos";
import { getUserFromWorkOSToken, verifyWorkOSToken } from "@app/lib/api/workos";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import type {
  GroupPermissionsJSON,
  ResourcesWithVerb,
} from "@app/lib/resources/group_permission_registry";
import {
  allWorkspacePermissions,
  GroupPermissions,
  grantTypesForVerb,
} from "@app/lib/resources/group_permission_registry";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { KeyAuthType, SystemKey } from "@app/lib/resources/key_resource";
import {
  DEFAULT_SYSTEM_KEY_NAME,
  isSystemKey,
  KeyResource,
  SECRET_KEY_PREFIX,
} from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type {
  ConcreteResourceType,
  GrantVerb,
  WorkspacePermissions,
} from "@app/types/group_permissions";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import type { GroupKind } from "@app/types/groups";
import type { PlanType, SubscriptionType } from "@app/types/plan";
import type { ProvidersHealth } from "@app/types/provider_credential";
import type {
  AccessControlList,
  WithAccessControl,
} from "@app/types/resource_permissions";
import { isDevelopment } from "@app/types/shared/env";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import {
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES,
} from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import { decodeUtf8HeaderValue } from "@app/types/shared/utils/http_headers";
import type {
  LightWorkspaceType,
  RoleType,
  UserType,
  WorkspaceType,
} from "@app/types/user";
import { isAdmin, isBuilder, isManager, isUser } from "@app/types/user";
import assert from "assert";
import { TokenExpiredError } from "jsonwebtoken";
import type { Transaction } from "sequelize";

const { ACTIVATE_ALL_FEATURES_DEV = false } = process.env;

const DUST_INTERNAL_EMAIL_REGEXP = /^[^@]+@dust\.tt$/;

export function isDustInternalEmail(email: string): boolean {
  return isDevelopment() || DUST_INTERNAL_EMAIL_REGEXP.test(email);
}

const DustApiKeyNameHeader = "x-dust-api-key-name";

export type AuthMethodType =
  | "system_api_key"
  | "api_key"
  | "oauth"
  | "session"
  | "sandbox_token"
  | "internal";

/** Principal used by poke when there is no provisioned Dust user (e.g. Cloudflare Access). */
export type PokePrincipal = {
  email: string;
  name: string | null;
};

// Bearer tokens are identified by their prefix: API keys start with `sk-`,
// sandbox exec tokens with `sbt-`. Anything else is treated as an OAuth
// (WorkOS) token.
export type AuthTokenKind = "api_key" | "sandbox_token" | "oauth";

export function getAuthTokenKind(token: string): AuthTokenKind {
  if (token.startsWith(SECRET_KEY_PREFIX)) {
    return "api_key";
  }
  if (token.startsWith(SANDBOX_TOKEN_PREFIX)) {
    return "sandbox_token";
  }
  return "oauth";
}

export interface AuthenticatorType {
  authMethod: AuthMethodType;
  workspaceId: string;
  userId: string | null;
  role: RoleType;
  groupIds: string[];
  subscriptionId: string | null;
  isByok: boolean;
  key?: KeyAuthType;
  attributionKey?: { id: ModelId; name: string };
  clientIp?: string;
  permissions?: GroupPermissionsJSON;
  globalGroupModelId?: ModelId | null;
}

/**
 * This is a class that will be used to check if a user can perform an action on a resource.
 * It acts as a central place to enforce permissioning across all of Dust.
 *
 * It explicitly does not store a reference to the current user to make sure our permissions are
 * workspace oriented. Use `getUserFromSession` if needed.
 */
export class Authenticator {
  _key?: KeyAuthType;
  // Attribution-only key reference. Records which API key a request should be
  // *attributed* to for usage analytics, independently of `_key`. It never
  // influences authorization (role, caps, system-key checks all read `_key`).
  _attributionKey?: { id: ModelId; name: string };
  _role: RoleType;
  _subscription: SubscriptionResource | null;
  _user: UserResource | null;
  _groupModelIds: ModelId[];
  _workspace: WorkspaceResource | null;
  _authMethod: AuthMethodType;
  _providersHealth: ProvidersHealth | null;
  _clientIp?: string;
  // Governance grants the caller holds, resolved by the factory (see `resolvePermissions`)
  _permissions: GroupPermissions;
  // The workspace global group's model id. `undefined` = not resolved yet (resolved lazily on first use)
  _globalGroupModelId: ModelId | null | undefined;
  // Set only by poke factory methods (`fromDustSuperUser` / `fromSuperUserSession`).
  // Regular session/API auths keep this false even if the user has the DB flag.
  _isDustSuperUser: boolean;
  // Poke operator principal when no provisioned Dust user is attached (CF Access).
  _pokePrincipal: PokePrincipal | null;

  // Should only be called from the static methods below.
  constructor({
    workspace,
    user,
    role,
    groupModelIds,
    authMethod,
    subscription,
    key,
    attributionKey,
    providersHealth,
    clientIp,
    permissions,
    globalGroupModelId,
    isDustSuperUser = false,
    pokePrincipal = null,
  }: {
    workspace?: WorkspaceResource | null;
    user?: UserResource | null;
    role: RoleType;
    groupModelIds: ModelId[];
    authMethod: AuthMethodType;
    subscription?: SubscriptionResource | null;
    key?: KeyAuthType;
    attributionKey?: { id: ModelId; name: string };
    providersHealth?: ProvidersHealth | null;
    clientIp?: string;
    permissions: GroupPermissions;
    globalGroupModelId?: ModelId | null;
    isDustSuperUser?: boolean;
    pokePrincipal?: PokePrincipal | null;
  }) {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    this._workspace = workspace || null;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    this._user = user || null;
    this._groupModelIds = groupModelIds;
    this._role = role;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    this._subscription = subscription || null;
    this._authMethod = authMethod;
    this._key = key;
    this._attributionKey = attributionKey;
    this._providersHealth = providersHealth ?? null;
    this._clientIp = clientIp;
    this._permissions = permissions;
    this._globalGroupModelId = globalGroupModelId;
    this._isDustSuperUser = isDustSuperUser;
    this._pokePrincipal = pokePrincipal;

    if (user) {
      tracer.setUser({
        id: user?.sId,
        role: role,
        plan: subscription?.getPlan().code,
        workspaceId: workspace?.sId,
        workspaceName: workspace?.name,
      });
    }
  }

  /**
   * Converts an array of arrays of group sIDs into AccessControlList objects.
   *
   * This utility method creates standard read/write permissions for each group.
   *
   * Permission logic:
   * - A user must belong to AT LEAST ONE group from EACH sub-array.
   *   Each sub-array creates a AccessControlList entry that can be satisfied by ANY of its groups.
   *   Example: [[1,2], [3,4]] means (1 OR 2) AND (3 OR 4)
   *
   * @param groupIds - Array of arrays of group string identifiers
   * @param workspaceId - The workspace the resources belong to
   * @returns Array of AccessControlList objects, one entry per sub-array
   */
  static createAccessControlListFromGroupIds(
    groupIds: string[][],
    workspaceId: ModelId
  ): AccessControlList[] {
    const getIdFromSIdOrThrow = (groupId: string) => {
      const id = getResourceIdFromSId(groupId);
      if (!id) {
        throw new Error(`Unexpected: Could not find id for group ${groupId}`);
      }
      return id;
    };

    // Each group in the same entry enforces OR relationship.
    return groupIds.map((group) => ({
      roles: [],
      groups: group.map((groupId) => ({
        id: getIdFromSIdOrThrow(groupId),
        permissions: ["read", "write"],
      })),
      workspaceId,
    }));
  }

  static async userFromSession(
    session: SessionWithUser | null
  ): Promise<UserResource | null> {
    if (session) {
      return UserResource.fetchByWorkOSUserId(session.user.workOSUserId);
    }

    return null;
  }

  /**
   * Fetches role, group memberships, and subscription for a user in a workspace.
   * Runs all three queries in parallel. If the user is not a member (role is
   * "none"), groups are reset to [] to prevent non-members from getting access
   * via the global group.
   */
  private static async fetchRoleGroupsAndSubscription({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: WorkspaceResource;
    transaction?: Transaction;
  }): Promise<{
    role: RoleType;
    groupModelIds: ModelId[];
    globalGroupModelId: ModelId | null;
    subscription: SubscriptionResource | null;
  }> {
    const lightWorkspace = renderLightWorkspaceType({ workspace });

    const [role, authGroups, subscription] = await Promise.all([
      MembershipResource.getActiveRoleForUserInWorkspace({
        user,
        workspace: lightWorkspace,
        transaction,
      }),
      GroupResource.dangerouslyListUserGroupsForAuth({
        user,
        workspace: lightWorkspace,
        transaction,
      }),
      SubscriptionResource.fetchActiveByWorkspaceModelId(
        lightWorkspace.id,
        transaction
      ),
    ]);

    const isMember = Authenticator.isMember(role);
    return {
      role,
      groupModelIds: isMember ? authGroups.groupModelIds : [],
      globalGroupModelId: isMember ? authGroups.globalGroupModelId : null,
      subscription,
    };
  }

  /**
   * Get an Authenticator for the target workspace associated with the authentified user from the
   * workos session.
   *
   * @param session any workos session
   * @param wId string target workspace id
   * @returns Promise<Authenticator>
   */
  static async fromSession(
    session: SessionWithUser | null,
    wId: string
  ): Promise<Authenticator> {
    return tracer.trace("fromSession", async () => {
      const [workspace, user] = await Promise.all([
        WorkspaceResource.fetchById(wId),
        this.userFromSession(session),
      ]);

      let role = "none" as RoleType;
      let groupModelIds: ModelId[] = [];
      let globalGroupModelId: ModelId | null = null;
      let subscription: SubscriptionResource | null = null;

      if (user && workspace) {
        const authData = await this.fetchRoleGroupsAndSubscription({
          user,
          workspace,
        });
        role = authData.role;
        groupModelIds = authData.groupModelIds;
        globalGroupModelId = authData.globalGroupModelId;
        subscription = authData.subscription;
      }

      const providersHealth = await this.fetchByokProvidersHealth(
        workspace,
        subscription
      );

      return new Authenticator({
        authMethod:
          session?.authenticationMethod === "bearer" ? "oauth" : "session",
        workspace,
        user,
        role,
        groupModelIds,
        globalGroupModelId,
        subscription,
        providersHealth,
        permissions: await this.resolvePermissions({
          workspace,
          groupModelIds,
        }),
      });
    });
  }

  /**
   * Checks if a role indicates workspace membership (role is not "none").
   */
  static isMember(role: RoleType): boolean {
    return role !== "none";
  }

  private static async fetchByokProvidersHealth(
    workspace: WorkspaceResource | null | undefined,
    subscription: SubscriptionResource | null,
    transaction?: Transaction
  ): Promise<ProvidersHealth | null> {
    if (!workspace || !subscription?.getPlan().isByok) {
      return null;
    }
    return ProviderCredentialResource.fetchProvidersHealthByWorkspaceId(
      workspace.id,
      transaction
    );
  }

  async refresh({ transaction }: { transaction?: Transaction } = {}) {
    if (!this._workspace) {
      return;
    }

    // Reload group memberships for user-backed auths. Key auths carry a fixed group set derived
    // from the key (not from live membership), so their `_groupModelIds` are left as-is.
    if (this._user) {
      if (Authenticator.isMember(this._role)) {
        const authGroups = await GroupResource.dangerouslyListUserGroupsForAuth(
          {
            user: this._user,
            workspace: renderLightWorkspaceType({ workspace: this._workspace }),
            transaction,
          }
        );
        this._groupModelIds = authGroups.groupModelIds;
        this._globalGroupModelId = authGroups.globalGroupModelId;
      } else {
        this._groupModelIds = [];
        this._globalGroupModelId = null;
      }
    }

    // Re-resolve grants from the current group set. Grants on those groups can change (backfill,
    // updatePermissions, create_pod, ...) even when the membership set does not, so this must run
    // for every auth — including auths that have no user (API/system keys, internal auths), which
    // the `_user` gate above skips. The agent loop freezes a serialized (user-less) key auth at
    // workflow start and refreshes it per step (see `fromJsonWithRefrehedGroups`); without this it
    // would keep a stale grant snapshot and deny access to resources granted mid-run.
    this._permissions = await Authenticator.resolvePermissions({
      workspace: this._workspace,
      groupModelIds: this._groupModelIds,
    });
  }

  /**
   * Get a an Authenticator for the target workspace and the authentified Super User user from the
   * workos session.
   * Super User will have `role` set to `admin` regardless of their actual role in the workspace.
   *
   * Only elevates (and sets the poke `_isDustSuperUser` flag) when the session
   * user has the DB super-user flag and a Dust-internal email. Otherwise
   * returns a non-privileged authenticator (legacy behavior for callers like
   * app runs `wIdTarget`).
   *
   * @param session any workos session
   * @param wId string target workspace id
   * @returns Promise<Authenticator>
   */
  static async fromSuperUserSession(
    session: SessionWithUser | null,
    wId: string | null
  ): Promise<Authenticator> {
    const user = await this.userFromSession(session);
    if (user && user.isDustSuperUser && isDustInternalEmail(user.email)) {
      return this.fromDustSuperUser({ user, wId });
    }

    const workspace = wId ? await WorkspaceResource.fetchById(wId) : null;
    const subscription = workspace
      ? await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id)
      : null;
    const providersHealth = await this.fetchByokProvidersHealth(
      workspace,
      subscription
    );

    return new Authenticator({
      authMethod: "session",
      workspace,
      user,
      role: "none",
      groupModelIds: [],
      subscription,
      providersHealth,
      permissions: await this.resolvePermissions({
        workspace,
        groupModelIds: [],
      }),
      isDustSuperUser: false,
    });
  }

  /**
   * Build a poke super-user Authenticator. Only poke entrypoints should call
   * this (or `fromSuperUserSession`). The resulting auth has
   * `_isDustSuperUser` set; regular session/API factories leave it false.
   *
   * Super users get `role` admin and all workspace groups when `wId` is set.
   * `pokePrincipal` is required when `user` is null (Cloudflare Access path).
   */
  static async fromDustSuperUser({
    user = null,
    wId = null,
    pokePrincipal = null,
  }: {
    user?: UserResource | null;
    wId?: string | null;
    pokePrincipal?: PokePrincipal | null;
  }): Promise<Authenticator> {
    const workspace = wId ? await WorkspaceResource.fetchById(wId) : null;

    const resolvedPokePrincipal: PokePrincipal | null = pokePrincipal
      ? {
          email: pokePrincipal.email.toLowerCase(),
          name: pokePrincipal.name,
        }
      : user
        ? { email: user.email, name: user.fullName() }
        : null;

    let groups: GroupResource[] = [];
    let subscription: SubscriptionResource | null = null;

    if (workspace) {
      [groups, subscription] = await Promise.all([
        GroupResource.internalFetchAllWorkspaceGroups({
          workspaceId: workspace.id,
        }),
        SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id),
      ]);
    }

    const providersHealth = await this.fetchByokProvidersHealth(
      workspace,
      subscription
    );

    const groupModelIds = groups.map((g) => g.id);
    return new Authenticator({
      authMethod: "session",
      workspace,
      user,
      role: "admin",
      groupModelIds,
      subscription,
      providersHealth,
      permissions: await this.resolvePermissions({
        workspace,
        groupModelIds,
      }),
      isDustSuperUser: true,
      pokePrincipal: resolvedPokePrincipal,
    });
  }
  /**
   * Get an Authenticator for the target workspace associated with the specified user.
   * To be used only in context where you can't get an authenticator object from a secured key (session or API Key)
   *
   * @param uId number user id
   * @param wId string target workspace sid
   * @returns Promise<Authenticator>
   */
  static async fromUserIdAndWorkspaceId(
    uId: string,
    wId: string,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Authenticator> {
    const [workspace, user] = await Promise.all([
      WorkspaceResource.fetchById(wId, transaction),
      UserResource.fetchById(uId, transaction),
    ]);

    let role: RoleType = "none";
    let groupModelIds: ModelId[] = [];
    let globalGroupModelId: ModelId | null = null;
    let subscription: SubscriptionResource | null = null;

    if (user && workspace) {
      const authData = await this.fetchRoleGroupsAndSubscription({
        user,
        workspace,
        transaction,
      });
      role = authData.role;
      groupModelIds = authData.groupModelIds;
      globalGroupModelId = authData.globalGroupModelId;
      subscription = authData.subscription;
    }

    const providersHealth = await this.fetchByokProvidersHealth(
      workspace,
      subscription,
      transaction
    );

    return new Authenticator({
      authMethod: "internal",
      workspace,
      user,
      role,
      groupModelIds,
      globalGroupModelId,
      subscription,
      providersHealth,
      permissions: await this.resolvePermissions({
        workspace,
        groupModelIds,
      }),
    });
  }

  static async fromWorkOSToken({
    token,
    wId,
  }: {
    token: WorkOSJwtPayload;
    wId: string;
  }): Promise<
    Result<
      Authenticator,
      { code: "user_not_found" | "workspace_not_found" | "sso_enforced" }
    >
  > {
    const [user, workspace] = await Promise.all([
      UserResource.fetchByWorkOSUserId(token.sub),
      WorkspaceResource.fetchById(wId),
    ]);

    if (!user) {
      return new Err({ code: "user_not_found" });
    }
    if (!workspace) {
      return new Err({ code: "workspace_not_found" });
    }

    const authData = await this.fetchRoleGroupsAndSubscription({
      user,
      workspace,
    });

    const providersHealth = await this.fetchByokProvidersHealth(
      workspace,
      authData.subscription
    );

    return new Ok(
      new Authenticator({
        authMethod: "oauth",
        workspace,
        groupModelIds: authData.groupModelIds,
        user,
        role: authData.role,
        subscription: authData.subscription,
        providersHealth,
        permissions: await this.resolvePermissions({
          workspace,
          groupModelIds: authData.groupModelIds,
        }),
      })
    );
  }

  static async fromSandboxToken(
    claims: SandboxTokenPayload,
    wId: string
  ): Promise<Result<Authenticator, APIErrorWithContentfulStatusCode>> {
    if (claims.wId !== wId) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "The sandbox token workspace does not match the request.",
        },
      });
    }

    const [workspace, user] = await Promise.all([
      WorkspaceResource.fetchById(wId),
      claims.uId ? UserResource.fetchById(claims.uId) : Promise.resolve(null),
    ]);

    if (!workspace) {
      return new Err({
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    if (claims.uId && !user) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "The user referenced by the sandbox token was not found.",
        },
      });
    }

    let role: RoleType;
    let baseGroupModelIds: ModelId[];
    let subscription: SubscriptionResource | null;

    if (user) {
      const authData = await this.fetchRoleGroupsAndSubscription({
        user,
        workspace,
      });

      if (authData.role === "none") {
        return new Err({
          status_code: 401,
          api_error: {
            type: "invalid_sandbox_token_error",
            message: "The user is not a member of this workspace.",
          },
        });
      }

      role = authData.role;
      baseGroupModelIds = authData.groupModelIds;
      subscription = authData.subscription;
    } else {
      // Userless sandbox token: conversation was driven by a non-human actor
      // (e.g. Slack bot user). Grant the lowest authenticated workspace role
      // and start from the workspace global group; conversation-space
      // restriction below still applies.
      const [globalGroup, activeSubscription] = await Promise.all([
        GroupResource.internalFetchWorkspaceGlobalGroup(workspace.id),
        SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id),
      ]);

      if (!globalGroup) {
        return new Err({
          status_code: 500,
          api_error: {
            type: "invalid_sandbox_token_error",
            message:
              "Could not resolve workspace global group for userless sandbox token.",
          },
        });
      }

      role = "user";
      baseGroupModelIds = [globalGroup.id];
      subscription = activeSubscription;
    }

    // Restrict groups to the sandbox owner's spaces so sandbox auth can only
    // access resources visible to the workload, not everything the user can.
    const groupModelIdSets: ModelId[][] = [];
    if (isSandboxExecTokenPayload(claims)) {
      const groupModelIdsRes = await this.restrictGroupsToSandboxExecSpaces(
        baseGroupModelIds,
        claims,
        workspace.id
      );
      if (groupModelIdsRes.isErr()) {
        return new Err(groupModelIdsRes.error);
      }
      groupModelIdSets.push(groupModelIdsRes.value);
    }
    if (isSandboxFunctionInvocationTokenPayload(claims)) {
      const groupModelIdsRes =
        await this.restrictGroupsToSandboxFunctionInvocationSpaces(
          baseGroupModelIds,
          claims,
          workspace.id
        );
      if (groupModelIdsRes.isErr()) {
        return new Err(groupModelIdsRes.error);
      }
      groupModelIdSets.push(groupModelIdsRes.value);
    }
    if (isSandboxFileSystemTokenPayload(claims)) {
      // This token kind is accepted only by the filesystem route. File access
      // comes from its signed conversation and Pod roots, not workspace groups.
      groupModelIdSets.push([]);
    }
    if (groupModelIdSets.length === 0) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "Unsupported sandbox token payload.",
        },
      });
    }
    const groupModelIds = [...new Set(groupModelIdSets.flat())];

    const providersHealth = await this.fetchByokProvidersHealth(
      workspace,
      subscription
    );

    return new Ok(
      new Authenticator({
        authMethod: "sandbox_token",
        workspace,
        user: user ?? undefined,
        role,
        groupModelIds,
        subscription,
        providersHealth,
        permissions: await this.resolvePermissions({
          workspace,
          groupModelIds,
        }),
      })
    );
  }

  private static async fetchRequestedSpaceIdsForSandboxTokenAuth({
    conversationId,
    workspaceId,
  }: {
    conversationId: string;
    workspaceId: ModelId;
  }): Promise<ModelId[] | null> {
    // Keep this direct lookup local to Authenticator for now. Sandbox-token
    // auth is being constructed here, and importing ConversationResource would
    // currently create an auth <-> conversation_resource runtime cycle because
    // ConversationResource imports auth helpers such as hasFeatureFlag.
    const conversation = await ConversationModel.findOne({
      where: { sId: conversationId, workspaceId },
      attributes: ["requestedSpaceIds"],
    });

    return conversation?.requestedSpaceIds ?? null;
  }

  /**
   * Given a user's full group IDs, restricts them to the groups associated with
   * the conversation and the agent's requested spaces. The agent can use tools
   * backed by spaces that are not explicitly selected on the conversation.
   *
   * Falls back to the full set if the conversation is not found or has no
   * requested spaces, preserving the existing behavior for legacy conversations.
   */
  private static async restrictGroupsToSandboxExecSpaces(
    userGroupIds: ModelId[],
    claims: SandboxExecTokenPayload,
    workspaceId: ModelId
  ): Promise<Result<ModelId[], APIErrorWithContentfulStatusCode>> {
    const [conversationRequestedSpaceIds, agentConfiguration] =
      await Promise.all([
        this.fetchRequestedSpaceIdsForSandboxTokenAuth({
          workspaceId,
          conversationId: claims.cId,
        }),
        AgentConfigurationModel.findOne({
          where: {
            sId: claims.aId,
            version: claims.aV,
            workspaceId,
          },
          attributes: ["requestedSpaceIds"],
        }),
      ]);

    if (!agentConfiguration && !isGlobalAgentId(claims.aId)) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message:
            "The agent version referenced by the sandbox token was not found.",
        },
      });
    }

    if (
      conversationRequestedSpaceIds === null ||
      conversationRequestedSpaceIds.length === 0
    ) {
      return new Ok(userGroupIds);
    }

    const requestedSpaceIds = new Set(conversationRequestedSpaceIds);
    for (const spaceId of agentConfiguration?.requestedSpaceIds ?? []) {
      requestedSpaceIds.add(spaceId);
    }

    const spaceGrants = await GroupPermissionModel.findAll({
      where: {
        resourceType: "space",
        resourceId: [...requestedSpaceIds],
        workspaceId,
      },
      attributes: ["groupId"],
    });

    const allowedGroupIds = new Set(
      spaceGrants.map((grant) => Number(grant.groupId) as ModelId)
    );

    return new Ok(userGroupIds.filter((id) => allowedGroupIds.has(id)));
  }

  private static async restrictGroupsToSandboxFunctionInvocationSpaces(
    userGroupIds: ModelId[],
    claims: SandboxFunctionInvocationTokenPayload,
    workspaceId: ModelId
  ): Promise<Result<ModelId[], APIErrorWithContentfulStatusCode>> {
    if (!isResourceSId("space", claims.spaceId)) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "The sandbox token pod space is invalid.",
        },
      });
    }

    const podSpaceModelId = getResourceIdFromSId(claims.spaceId);
    if (podSpaceModelId === null) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "The sandbox token pod space is invalid.",
        },
      });
    }

    const allowedSpaceIds = new Set<ModelId>([podSpaceModelId]);

    // Auto internal MCP server views live in the global space: without it, a function invocation
    // cannot list or call any tool. Group membership still applies (the groups below are
    // intersected with the token's base groups).
    const globalSpace = await SpaceModel.findOne({
      attributes: ["id"],
      where: { workspaceId, kind: "global" },
    });
    if (globalSpace) {
      allowedSpaceIds.add(globalSpace.id);
    }

    if (claims.cId) {
      const requestedSpaceIds =
        await this.fetchRequestedSpaceIdsForSandboxTokenAuth({
          workspaceId,
          conversationId: claims.cId,
        });

      if (requestedSpaceIds === null) {
        return new Err({
          status_code: 401,
          api_error: {
            type: "invalid_sandbox_token_error",
            message: "The sandbox token conversation is invalid.",
          },
        });
      }

      for (const spaceId of requestedSpaceIds) {
        allowedSpaceIds.add(spaceId);
      }
    }

    const spaceGrants = await GroupPermissionModel.findAll({
      where: {
        resourceType: "space",
        resourceId: [...allowedSpaceIds],
        workspaceId,
      },
      attributes: ["groupId"],
    });

    const allowedGroupIds = new Set(
      spaceGrants.map((grant) => Number(grant.groupId) as ModelId)
    );

    return new Ok(userGroupIds.filter((id) => allowedGroupIds.has(id)));
  }

  /**
   * Returns an Authenticator for the workspace provided as an argument, authenticated with the
   * given API key. The key does not have to belong to that workspace: when it does not, it
   * confers no groups and no role there.
   *
   * @param key Key the API key
   * @param wId the target workspaceId
   * @param requestedGroupIds optional groups to assign the auth in place of the key groups (only
   *                                   possible with a system key).
   * @param requestedRole optional role to assign the auth in place of the key role (only possible
   *                               with a system key).
   * @returns Promise<Authenticator>
   */
  static async fromKey(
    key: KeyResource,
    wId: string,
    requestedGroupIds?: string[],
    requestedRole?: RoleType
  ): Promise<Authenticator> {
    const [workspace, keyWorkspace] = await Promise.all([
      WorkspaceResource.fetchById(wId),
      WorkspaceResource.fetchByModelId(key.workspaceId),
    ]);

    if (!keyWorkspace) {
      throw new Error("Key workspace not found");
    }

    let role = "none" as RoleType;
    const isKeyWorkspace = keyWorkspace.id === workspace?.id;
    if (isKeyWorkspace) {
      if (key.isSystem) {
        // System keys have admin role on their workspace unless requested otherwise.
        role = requestedRole ?? "admin";
      } else {
        // Regular keys use the role they provide
        role = key.role;
      }
    }

    let keyGroups: GroupResource[] = [];
    let requestedGroups: GroupResource[] = [];
    let workspaceSubscription: SubscriptionResource | null = null;

    if (workspace) {
      const lightWorkspace = renderLightWorkspaceType({ workspace });
      if (requestedGroupIds && key.isSystem) {
        [requestedGroups, workspaceSubscription] = await Promise.all([
          GroupResource.listGroupsWithSystemKey(key, requestedGroupIds),
          // Fetched separately: the requested groups might not include the global group, which is
          // what fetchRoleGroupsAndSubscription uses to resolve the subscription.
          SubscriptionResource.fetchActiveByWorkspaceModelId(lightWorkspace.id),
        ]);
      } else {
        [keyGroups, workspaceSubscription] = await Promise.all([
          GroupResource.listWorkspaceGroupsFromKey(key),
          SubscriptionResource.fetchActiveByWorkspaceModelId(lightWorkspace.id),
        ]);
      }
    }
    const allGroups = requestedGroupIds ? requestedGroups : keyGroups;

    const workspaceProvidersHealth = await this.fetchByokProvidersHealth(
      workspace,
      workspaceSubscription
    );

    // If the key is associated with the workspace, we associate the groups.
    const workspaceGroupModelIds = isKeyWorkspace
      ? allGroups.map((g) => g.id)
      : [];

    // `requestedGroupIds` replaces the key's own groups (the Slack bot acting as a user), so the
    // resolution goes through those groups instead of the key.
    const systemKey = !requestedGroupIds && isSystemKey(key) ? key : null;

    // The target workspace is not necessarily the key's; when it is not, the key says nothing
    // about it and `workspaceGroupModelIds` is empty.
    const permissions = await this.resolvePermissions(
      systemKey && isKeyWorkspace
        ? { workspace, systemKey }
        : { workspace, groupModelIds: workspaceGroupModelIds }
    );

    return new Authenticator({
      authMethod: key.isSystem ? "system_api_key" : "api_key",
      groupModelIds: workspaceGroupModelIds,
      key: key.toAuthJSON(),
      role,
      subscription: workspaceSubscription,
      workspace,
      providersHealth: workspaceProvidersHealth,
      permissions,
    });
  }

  /**
   * Creates an Authenticator for a given workspace (with role `user`). Used for internal calls
   * to the Dust API or other functions, when the system is calling something for the workspace.
   * Only the workspace global group is granted; use `internalAdminForWorkspace` when broader
   * access is required.
   * @param workspaceId string
   */
  static async internalUserForWorkspace(
    workspaceId: string
  ): Promise<Authenticator> {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Could not find workspace with sId ${workspaceId}`);
    }

    let globalGroup: GroupResource | null = null;
    let subscription: SubscriptionResource | null = null;

    [globalGroup, subscription] = await Promise.all([
      GroupResource.internalFetchWorkspaceGlobalGroup(workspace.id),
      SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id),
    ]);

    const providersHealth = await this.fetchByokProvidersHealth(
      workspace,
      subscription
    );

    const groupModelIds = globalGroup ? [globalGroup.id] : [];
    return new Authenticator({
      authMethod: "internal",
      workspace,
      role: "user",
      groupModelIds,
      subscription,
      providersHealth,
      permissions: await this.resolvePermissions({
        workspace,
        groupModelIds,
      }),
    });
  }

  /* As above, with role `admin`. Use requestAllGroups with care as it gives access to all groups
   * within the workpsace. */
  static async internalAdminForWorkspace(
    workspaceId: string,
    options?: {
      dangerouslyRequestAllGroups: boolean;
      // Only applies when dangerouslyRequestAllGroups is true. Overrides the group kinds fetched,
      // e.g. to include editor groups that are excluded by default.
      groupKinds?: GroupKind[];
    }
  ): Promise<Authenticator> {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Could not find workspace with sId ${workspaceId}`);
    }

    const [groups, subscription] = await Promise.all([
      (async () => {
        if (options?.dangerouslyRequestAllGroups) {
          return GroupResource.internalFetchAllWorkspaceGroups({
            workspaceId: workspace.id,
            ...(options.groupKinds ? { groupKinds: options.groupKinds } : {}),
          });
        } else {
          const globalGroup =
            await GroupResource.internalFetchWorkspaceGlobalGroup(workspace.id);
          return globalGroup ? [globalGroup] : [];
        }
      })(),
      SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id),
    ]);

    const providersHealth = await this.fetchByokProvidersHealth(
      workspace,
      subscription
    );

    const groupModelIds = groups.map((g) => g.id);
    return new Authenticator({
      authMethod: "internal",
      workspace,
      role: "admin",
      groupModelIds,
      subscription,
      providersHealth,
      permissions: await this.resolvePermissions({
        workspace,
        groupModelIds,
      }),
    });
  }

  /**
   * Exchanges an Authenticator associated with a system key for one associated with a user.
   *
   * /!\ This function should only be used with Authenticators that are associated with a system key.
   *
   * @param auth
   * @param param1
   * @returns
   */
  async exchangeSystemKeyForUserAuthByEmail(
    auth: Authenticator,
    { userEmail }: { userEmail: string }
  ): Promise<Authenticator | null> {
    if (!auth.isSystemKey()) {
      logger.error(
        {
          keyId: auth.key()?.id,
          userEmail,
          workspaceId: auth.workspace()?.sId,
        },
        "Attempted to exchange non-system key authenticator for user authenticator"
      );

      throw new Error("Provided authenticator does not have a system key.");
    }

    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Workspace not found.");
    }

    // The same email address might be linked to multiple users.
    const users = await UserResource.listByEmail(userEmail);
    // If no user exist (e.g., whitelisted email addresses),
    // simply ignore and return null.
    if (users.length === 0) {
      return null;
    }

    // Verify that one of the user has an active membership in the specified workspace.
    const { memberships: activeMemberships, total } =
      await MembershipResource.getActiveMemberships({
        users,
        workspace: owner,
      });
    // If none of the user has an active membership in the workspace,
    // simply ignore and return null.
    if (total === 0) {
      return null;
    }

    // Take the oldest active membership.
    const [activeMembership] = activeMemberships.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    // Find the user associated with the active membership.
    const user = users.find((u) => u.id === activeMembership.userId);
    if (!user) {
      return null;
    }

    // Membership already verified above (activeMembership found).
    const { groupModelIds, globalGroupModelId } =
      await GroupResource.dangerouslyListUserGroupsForAuth({
        user,
        workspace: owner,
      });

    return new Authenticator({
      authMethod: auth.authMethod(),
      key: auth._key,
      // We limit scope to a user role.
      role: "user",
      groupModelIds,
      globalGroupModelId,
      user,
      subscription: auth._subscription,
      workspace: auth._workspace,
      providersHealth: auth._providersHealth,
      permissions: await Authenticator.resolvePermissions({
        workspace: auth._workspace,
        groupModelIds,
      }),
    });
  }

  exchangeKey(key: KeyAuthType) {
    return new Authenticator({
      authMethod: this.authMethod(),
      key,
      role: this._role,
      groupModelIds: this._groupModelIds,
      user: this._user,
      subscription: this._subscription,
      workspace: this._workspace,
      clientIp: this._clientIp,
      providersHealth: this._providersHealth,
      // Role and groups are unchanged, so capabilities carry over unchanged.
      permissions: this._permissions,
      isDustSuperUser: this._isDustSuperUser,
      pokePrincipal: this._pokePrincipal,
    });
  }

  providersHealth(): ProvidersHealth | null {
    return this._providersHealth;
  }

  clientIp(): string | undefined {
    return this._clientIp;
  }

  setClientIp(ip: string) {
    this._clientIp = ip;
  }

  role(): RoleType {
    return this._role;
  }

  isUser(): boolean {
    return isUser(this.workspace());
  }

  isBuilder(): boolean {
    return isBuilder(this.workspace());
  }

  isManager(): boolean {
    return isManager(this.workspace());
  }

  isAdmin(): boolean {
    return isAdmin(this.workspace());
  }

  /**
   * Whether the caller holds a workspace-level capability, asked as a type-level verb (e.g.
   * "create" on "agent"). A thin wrapper over `hasPermission` against a handmade, type-wide ACL:
   * the synthetic admin role grants admins every capability by default, and everyone else derives
   * it from their type-wide `group_permissions` grants.
   */
  async hasWorkspacePermission(
    verb: GrantVerb,
    resourceType: ConcreteResourceType
  ): Promise<boolean> {
    // Reject invalid capability queries (e.g. create/billing) up front so callers fail fast on a
    // programmer error rather than silently returning false.
    const grantTypes = grantTypesForVerb(resourceType, verb, "type");
    assert(
      grantTypes.length > 0,
      `Verb "${verb}" is not allowed (no type-level role grants it) on resource type "${resourceType}".`
    );

    const workspace = this.workspace();
    if (!workspace) {
      return false;
    }

    return this.hasPermissionForAcl(verb, {
      roles: [{ role: "admin", permissions: [verb] }],
      grantedVerbs: this.getGrantedVerbs(resourceType, WHOLE_TYPE_RESOURCE_ID),
      workspaceId: workspace.id,
    });
  }

  /**
   * The caller's workspace capabilities, as the wire shape consumed by the `/permissions` endpoint.
   * Admins hold every capability by default; everyone else derives them from the grants resolved at
   * construction.
   */
  async getWorkspacePermissions(): Promise<WorkspacePermissions> {
    if (this.isAdmin()) {
      return allWorkspacePermissions();
    }
    return this._permissions.toWorkspacePermissions();
  }

  /**
   * Resolves the grant set a caller holds, before an Authenticator exists. Returns only the grants
   * on the caller's groups — no role logic. Admin-by-default access to workspace-wide capabilities
   * is layered on by `hasWorkspacePermission` / `getWorkspacePermissions`, so being an admin does
   * NOT confer access to a specific instance unless a grant grants it. Cheap for callers with no
   * groups (no query).
   */
  static async resolvePermissions(
    // Groups or a system key, never both: a system key is attached to every group of its
    // workspace, so its grants are the wildcard and reading them back would scan the workspace's
    // whole `group_permissions` slice. A system key narrowed to a group subset must resolve from
    // those groups, so the two inputs are mutually exclusive rather than a rule to remember.
    params: { workspace?: WorkspaceResource | null } & (
      | { groupModelIds: ModelId[]; systemKey?: never }
      | { systemKey: SystemKey; groupModelIds?: never }
    )
  ): Promise<GroupPermissions> {
    const { workspace } = params;
    if (!workspace) {
      return GroupPermissions.empty();
    }

    if (params.systemKey) {
      return GroupPermissions.fromGrants([
        {
          grantType: "*",
          resourceType: "*",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        },
      ]);
    }

    const lightWorkspace = renderLightWorkspaceType({ workspace });
    const grants = await GroupPermissionResource.listForGroups(lightWorkspace, {
      groupModelIds: params.groupModelIds,
    });

    return GroupPermissions.fromGrants(grants);
  }

  isSystemKey(): boolean {
    return !!this._key?.isSystem;
  }

  isKey(): boolean {
    return !!this._key;
  }

  isSandboxToken(): boolean {
    return this._authMethod === "sandbox_token";
  }

  authMethod(): AuthMethodType {
    return this._authMethod;
  }

  workspace(): WorkspaceType | null {
    return this._workspace
      ? {
          id: this._workspace.id,
          sId: this._workspace.sId,
          name: this._workspace.name,
          role: this._role,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          segmentation: this._workspace.segmentation || null,
          ssoEnforced: this._workspace.ssoEnforced,
          regionalModelsOnly: this._workspace.regionalModelsOnly,
          workOSOrganizationId: this._workspace.workOSOrganizationId,
          whiteListedProviders: this._workspace.whiteListedProviders,
          defaultEmbeddingProvider: this._workspace.defaultEmbeddingProvider,
          metadata: this._workspace.metadata,
          metronomeCustomerId: this._workspace.metronomeCustomerId ?? null,
          sharingPolicy: this._workspace.sharingPolicy ?? "all_scopes",
        }
      : null;
  }

  getNonNullableWorkspace(): WorkspaceType {
    const workspace = this.workspace();

    if (!workspace) {
      throw new Error(
        "Unexpected unauthenticated call to `getNonNullableWorkspace`."
      );
    }

    return workspace;
  }

  subscription(): SubscriptionType | null {
    return this._subscription === null ? null : this._subscription.toJSON();
  }

  getNonNullableSubscription(): SubscriptionType {
    const subscription = this.subscription();

    if (!subscription) {
      throw new Error(
        "Unexpected unauthenticated call to `getNonNullableSubscription`."
      );
    }

    return subscription;
  }

  subscriptionResource(): SubscriptionResource | null {
    return this._subscription;
  }

  getNonNullableSubscriptionResource(): SubscriptionResource {
    const subscriptionResource = this.subscriptionResource();

    if (!subscriptionResource) {
      throw new Error(
        "Unexpected unauthenticated call to `getNonNullableSubscriptionResource`."
      );
    }

    return subscriptionResource;
  }

  plan(): PlanType | null {
    return this._subscription ? this._subscription.getPlan() : null;
  }

  getNonNullablePlan(): PlanType {
    const plan = this.plan();

    if (!plan) {
      throw new Error(
        "Unexpected unauthenticated call to `getNonNullablePlan`."
      );
    }

    return plan;
  }

  isUpgraded(): boolean {
    return isUpgraded(this.plan());
  }

  /**
   * This is a convenience method to get the user from the Authenticator. The returned UserResource
   * object won't have the user's workspaces set.
   * @returns
   */
  user(): UserResource | null {
    return this._user ?? null;
  }

  getNonNullableUser(): UserResource {
    const user = this.user();

    if (!user) {
      throw new Error(
        "Unexpected unauthenticated call to `getNonNullableUser`."
      );
    }

    return user;
  }

  isDustSuperUser(): boolean {
    return this._isDustSuperUser;
  }

  /**
   * Poke operator principal (email/name). Prefers the attached Dust user when
   * present; otherwise the Cloudflare Access principal stashed at auth time.
   */
  getPokePrincipal(): PokePrincipal {
    if (this._pokePrincipal) {
      return this._pokePrincipal;
    }
    if (this._user) {
      return { email: this._user.email, name: this._user.fullName() };
    }
    throw new Error("Unexpected poke authenticator without principal.");
  }

  /**
   * User payload for poke UI / audit. Uses the real user when available;
   * otherwise a non-persisted shape derived from Cloudflare Access claims.
   */
  toPokeUserJSON(): UserType {
    if (this._user) {
      return this._user.toJSON();
    }

    const principal = this.getPokePrincipal();
    const displayName =
      principal.name?.trim() || principal.email.split("@")[0] || "poke";
    const [firstName, ...rest] = displayName.split(/\s+/);

    return {
      sId: `poke_${principal.email}`,
      id: 0,
      createdAt: 0,
      provider: null,
      username: principal.email.split("@")[0] || "poke",
      email: principal.email,
      firstName: firstName || "poke",
      lastName: rest.length > 0 ? rest.join(" ") : null,
      fullName: displayName,
      image: null,
      lastLoginAt: null,
    };
  }

  groupModelIds(): ModelId[] {
    return this._groupModelIds;
  }

  // The workspace global group's model id, used by openness checks (see
  // `SpaceResource.listOpenSpaceModelIds`). Resolved once by the factory from the caller's group
  // fetch and cached on the instance; falls back to a lazy query for auths that did not provide it
  // (e.g. system/internal auths). Returns null for a non-member or an auth with no workspace — a
  // workspace always has a global group, so null is about this auth, not a missing group.
  async getGlobalGroupModelId(): Promise<ModelId | null> {
    if (this._globalGroupModelId !== undefined) {
      return this._globalGroupModelId;
    }
    if (!this._workspace) {
      this._globalGroupModelId = null;
      return null;
    }

    const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(this);
    this._globalGroupModelId = globalGroupRes.isOk()
      ? globalGroupRes.value.id
      : null;
    return this._globalGroupModelId;
  }

  hasGroupByModelId(groupId: ModelId): boolean {
    return this._groupModelIds.includes(groupId);
  }

  /**
   * The verbs the caller holds on `(resourceType, resourceId)`, resolved from their governance
   * grants (folding in the type-wide (-1) grants). Caller-scoped and pre-resolved — resources fold
   * this into their `AccessControlList` as `grantedVerbs`, which the checker uses directly with no
   * group-membership step. Pass `WHOLE_TYPE_RESOURCE_ID` for a workspace-wide capability.
   */
  getGrantedVerbs(
    resourceType: ConcreteResourceType,
    resourceId: number
  ): GrantVerb[] {
    return this._permissions.resolvedVerbsForResource(resourceType, resourceId);
  }

  /**
   * The instances of `resourceType` the caller may `verb`, resolved from their governance grants.
   * The enumeration counterpart of `getGrantedVerbs` — "which resources may I act on" rather than
   * "what may I do on this one" — for reverse lookups such as the projects a caller belongs to.
   * Returns `{ kind: "all" }` when a type-wide grant confers the verb on every instance, which a
   * system key holds on every type (see `resolvePermissions`).
   */
  getResourceIdsWithVerb(
    resourceType: ConcreteResourceType,
    verb: GrantVerb
  ): ResourcesWithVerb {
    return this._permissions.resourceIdsWithVerb(resourceType, verb);
  }

  /**
   * Whether the caller holds `verb` on `target` — i.e. on EVERY access-control list the target
   * declares (a resource may declare multiple ACLs that must all hold). `verb` is a grant verb
   * (instance verbs like read/write/admin, or type-level capabilities like "create").
   */
  hasPermission(verb: GrantVerb, target: WithAccessControl): boolean {
    return this.hasPermissionForAcls(verb, target.getAccessControlLists(this));
  }

  can(verb: GrantVerb, target: WithAccessControl): boolean {
    return this.hasPermission(verb, target);
  }

  /**
   * Whether the caller holds `verb` on EVERY one of the given targets (conjunction).
   */
  hasPermissionForAll(verb: GrantVerb, targets: WithAccessControl[]): boolean {
    return targets.every((target) => this.hasPermission(verb, target));
  }

  /**
   * Whether the caller holds `verb` on every ACL in the list (conjunction). This is the raw-ACL
   * entry point: callers that already hold built or derived ACLs (e.g. a space's served ACLs, the
   * cross-space conversation checks) use this directly, rather than going through a
   * `WithAccessControl` target.
   */
  hasPermissionForAcls(verb: GrantVerb, acls: AccessControlList[]): boolean {
    return acls.every((acl) => this.hasPermissionForAcl(verb, acl));
  }

  // Single-ACL check. The grant sources are additive (OR): the caller passes if any of them grants
  // `verb`. An absent source contributes nothing, so an ACL with no matching source denies.
  // - Role: the caller's workspace role grants `verb` (and the ACL is in the caller's workspace).
  // - grantedVerbs: the caller's own governance verbs, already resolved — used directly, no
  //   membership step (the caller-scoping is baked in when they are resolved).
  // - groups: legacy group listing, filtered by the caller's membership here at check time. This is
  //   what lets the same checker also evaluate ACLs that enumerate every group (e.g. the cross-space
  //   conversation checks).
  private hasPermissionForAcl(
    verb: GrantVerb,
    acl: AccessControlList
  ): boolean {
    // Role path: gated to the caller's workspace (a role only applies within its own workspace).
    const grantedByRole =
      this.getNonNullableWorkspace().id === acl.workspaceId &&
      (acl.roles ?? []).some(
        (r) => this.role() === r.role && r.permissions.includes(verb)
      );
    if (grantedByRole) {
      return true;
    }

    // Governance path: the caller's verbs are pre-resolved, so no membership step is needed.
    if ((acl.grantedVerbs ?? []).includes(verb)) {
      return true;
    }

    // Legacy group path: group membership is inherently workspace-scoped, so it needs no gate.
    return this._groupModelIds.some((groupId) =>
      (acl.groups ?? []).some(
        (g) => g.id === groupId && g.permissions.includes(verb)
      )
    );
  }

  key(): KeyAuthType | null {
    return this._key ?? null;
  }

  attributionKey(): { id: ModelId; name: string } | null {
    return this._attributionKey ?? null;
  }

  attributionKeyModelId(): ModelId | null {
    return this._attributionKey?.id ?? null;
  }

  // Returns a copy of this authenticator carrying an attribution-only key
  // reference. Used to attribute usage to the original caller's key when an
  // internal flow re-authenticates with the workspace system key (e.g. run_agent
  // sub-agents). This is attribution only: `_key` is left untouched, so role,
  // caps and system-key checks keep operating on the actual (system) key.
  withAttributionKey(attributionKey: {
    id: ModelId;
    name: string;
  }): Authenticator {
    return new Authenticator({
      authMethod: this._authMethod,
      key: this._key,
      attributionKey,
      role: this._role,
      groupModelIds: this._groupModelIds,
      user: this._user,
      subscription: this._subscription,
      workspace: this._workspace,
      clientIp: this._clientIp,
      providersHealth: this._providersHealth,
      // Attribution-only copy: role and groups are unchanged, so capabilities carry over unchanged.
      permissions: this._permissions,
      isDustSuperUser: this._isDustSuperUser,
      pokePrincipal: this._pokePrincipal,
    });
  }

  toJSON(): AuthenticatorType {
    const workspace = this._workspace;
    assert(workspace, "Workspace is required to serialize Authenticator");

    return {
      authMethod: this._authMethod,
      workspaceId: workspace.sId,
      userId: this._user?.sId ?? null,
      role: this._role,
      groupIds: this._groupModelIds.map((id) =>
        GroupResource.modelIdToSId({ id, workspaceId: workspace.id })
      ),
      subscriptionId: this._subscription?.sId ?? null,
      isByok: this.plan()?.isByok ?? false,
      key: this._key,
      attributionKey: this._attributionKey,
      clientIp: this._clientIp,
      permissions: this._permissions.toJSON(),
      globalGroupModelId: this._globalGroupModelId,
    };
  }

  static async fromJSON(authType: AuthenticatorType): Promise<Authenticator> {
    const [workspace, user] = await Promise.all([
      authType.workspaceId
        ? WorkspaceResource.fetchById(authType.workspaceId)
        : null,
      authType.userId ? UserResource.fetchById(authType.userId) : null,
    ]);

    const subscription = workspace
      ? await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id)
      : null;

    // Skip mismatch check for no-plan subscriptions: they have ephemeral random sIds
    // that change on every fetch, so they can never match the original.
    if (
      authType.subscriptionId &&
      subscription &&
      subscription.sId !== authType.subscriptionId &&
      !subscription.isLegacyFreeNoPlan()
    ) {
      logger.info(
        {
          workspaceId: authType.workspaceId,
          originalSubscriptionId: authType.subscriptionId,
          currentSubscriptionId: subscription.sId,
        },
        "Subscription changed since auth was serialized, using current active subscription"
      );
    }

    const groupIds = removeNulls(
      authType.groupIds.map((sId) => getResourceIdFromSId(sId))
    );

    const providersHealth = await this.fetchByokProvidersHealth(
      workspace,
      subscription
    );

    return new Authenticator({
      authMethod: authType.authMethod,
      workspace,
      user,
      role: authType.role,
      groupModelIds: groupIds,
      subscription,
      key: authType.key,
      attributionKey: authType.attributionKey,
      providersHealth,
      clientIp: authType.clientIp,
      globalGroupModelId: authType.globalGroupModelId,
      permissions: authType.permissions
        ? GroupPermissions.fromJSON(authType.permissions)
        : // Payloads serialized before governance grants existed (in-flight Temporal workflows
          // across the deploy) carry no permissions: resolve them from the groups rather than
          // running with an empty grant set, which would silently deny every capability check.
          await this.resolvePermissions({
            workspace,
            groupModelIds: groupIds,
          }),
    });
  }

  /**
   * Rebuilds an Authenticator from a serialized snapshot and refreshes group
   * memberships from the database. Used by the agent loop, which freezes auth at
   * workflow start: tools that grant new group access (e.g. create_pod) must see
   * up-to-date memberships on subsequent steps.
   */
  static async fromJsonWithRefrehedGroups(
    authType: AuthenticatorType
  ): Promise<Authenticator> {
    const auth = await Authenticator.fromJSON(authType);
    await auth.refresh();
    return auth;
  }
}

/**
 * Extracts the Bearer token from an Authorization header value.
 */
export async function getBearerToken(
  authHeader: string | undefined
): Promise<Result<string, APIErrorWithContentfulStatusCode>> {
  if (!authHeader) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "missing_authorization_header_error",
        message: "Missing Authorization header",
      },
    });
  }

  const parse = authHeader.match(/^Bearer\s+([A-Za-z0-9-._~+/]+=*)$/i);
  if (!parse || !parse[1]) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "malformed_authorization_header_error",
        message: "Missing Authorization header",
      },
    });
  }

  return new Ok(parse[1]);
}

export type BearerTokenError =
  | "not_authenticated"
  | "invalid_oauth_token_error"
  | "expired_oauth_token_error"
  | "user_not_found";

/**
 * Attempts to create a SessionWithUser from a bearer token in the request.
 *
 * This is used as a fallback in withLogging when no cookie-based session is available.
 * It validates the bearer token, resolves the user, and synthesizes a SessionWithUser
 * object so that downstream handlers (getUserFromSession, etc.) work transparently.
 *
 * Returns an Err with a BearerTokenError if the token is present but invalid/expired,
 * or Ok(null) if no bearer token is present, or Ok(session) on success.
 */
export async function getSessionFromBearerToken(
  authHeader: string | undefined
): Promise<Result<SessionWithUser | null, BearerTokenError>> {
  const bearerTokenRes = await getBearerToken(authHeader);
  if (bearerTokenRes.isErr()) {
    return new Ok(null);
  }

  const bearerToken = bearerTokenRes.value;
  if (getAuthTokenKind(bearerToken) !== "oauth") {
    return new Ok(null);
  }

  let workOSDecoded: Result<WorkOSJwtPayload, Error>;
  try {
    workOSDecoded = await verifyWorkOSToken(bearerToken);
  } catch {
    // verifyWorkOSToken can throw if config is missing (e.g. WORKOS_CLIENT_ID).
    return new Ok(null);
  }
  if (workOSDecoded.isErr()) {
    if (workOSDecoded.error instanceof TokenExpiredError) {
      // Token signature was valid but expired — this is definitely a WorkOS token.
      return new Err("expired_oauth_token_error");
    }
    // Verification failed — could be a non-WorkOS token (e.g. viz JWT).
    // Return null to let the handler do its own auth.
    return new Ok(null);
  }

  const user = await getUserFromWorkOSToken(workOSDecoded.value);
  if (!user) {
    return new Err("user_not_found");
  }

  return new Ok({
    type: "workos",
    sessionId: "bearer-token",
    user: {
      email: user.email,
      email_verified: true,
      name: user.name,
      nickname: user.username,
      workOSUserId: user.workOSUserId ?? "",
      given_name: user.firstName,
      family_name: user.lastName ?? undefined,
      picture: user.imageUrl ?? undefined,
    },
    region: multiRegionsConfig.getCurrentRegion(),
    organizationId: workOSDecoded.value.org_id,
    isSSO: false,
    authenticationMethod: "bearer",
  });
}

/**
 * Retrieves the API Key from the Authorization header value.
 * @returns Result<Key, APIErrorWithContentfulStatusCode>
 */
export async function getAPIKey(
  authHeader: string | undefined
): Promise<Result<KeyResource, APIErrorWithContentfulStatusCode>> {
  const token = await getBearerToken(authHeader);

  if (token.isErr()) {
    return new Err(token.error);
  }

  if (!token.value.startsWith("sk-")) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "malformed_authorization_header_error",
        message: "Malformed Authorization header",
      },
    });
  }

  const key = await KeyResource.fetchBySecret(token.value);

  if (!key || !key.isActive) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "invalid_api_key_error",
        message: "The API key provided is invalid or disabled.",
      },
    });
  }

  if (!key.isSystem) {
    await key.markAsUsed();
  }

  return new Ok(key);
}

/**
 * Retrieves or create a system API key for a given workspace
 * @param workspace WorkspaceType
 * @returns Promise<Result<KeyResource, Error>>
 */
export async function getOrCreateSystemApiKey(
  workspace: LightWorkspaceType
): Promise<Result<KeyResource, Error>> {
  let key = await KeyResource.fetchSystemKeyForWorkspace(workspace);

  if (!key) {
    const group = await GroupResource.internalFetchWorkspaceSystemGroup(
      workspace.id
    );
    key = await KeyResource.makeNew(
      {
        workspaceId: workspace.id,
        isSystem: true,
        status: "active",
        role: "admin",
        name: DEFAULT_SYSTEM_KEY_NAME,
      },
      [group]
    );
  }

  if (!key) {
    return new Err(new Error("Failed to create system key."));
  }

  return new Ok(key);
}

/**
 * Retrieves a system API key for the given owner, creating one if needed.
 *
 * In development mode, we retrieve the system API key from the environment variable
 * `DUST_DEVELOPMENT_SYSTEM_API_KEY`, so that we always use our own `dust` workspace in production
 * to iterate on the design of the packaged apps. When that's the case, the `owner` paramater (which
 * is local) is ignored.
 *
 * @param owner WorkspaceType
 * @returns DustAPICredentials
 */
export async function prodAPICredentialsForOwner(
  owner: LightWorkspaceType,
  {
    useLocalInDev,
  }: {
    useLocalInDev: boolean;
  } = { useLocalInDev: false }
): Promise<{
  apiKey: string;
  workspaceId: string;
}> {
  if (
    isDevelopment() &&
    !config.getDustAPIConfig().url.startsWith("http://localhost") &&
    !useLocalInDev
  ) {
    return {
      apiKey: config.getDustDevelopmentSystemAPIKey(),
      workspaceId: config.getDustDevelopmentWorkspaceId(),
    };
  }

  const systemAPIKeyRes = await getOrCreateSystemApiKey(owner);
  if (systemAPIKeyRes.isErr()) {
    logger.error(
      {
        owner,
        error: systemAPIKeyRes.error,
      },
      "Could not create system API key for workspace"
    );
    throw new Error(`Could not create system API key for workspace`);
  }

  return {
    apiKey: systemAPIKeyRes.value.secret,
    workspaceId: owner.sId,
  };
}

export async function getFeatureFlagsForWorkspace(
  workspace: LightWorkspaceType
): Promise<WhitelistableFeature[]> {
  if (ACTIVATE_ALL_FEATURES_DEV && isDevelopment()) {
    return [...WHITELISTABLE_FEATURES];
  }

  const [workspaceFlags, globalFlags] = await Promise.all([
    FeatureFlagResource.listForWorkspace(workspace),
    GlobalFeatureFlagResource.listAll(),
  ]);
  const workspaceFlagNames = new Set(workspaceFlags.map((flag) => flag.name));

  // Start with workspace-level flags (always take precedence).
  const effectiveFlags = [...workspaceFlagNames];

  // Add global flags that aren't already set at workspace level.
  for (const globalFlag of globalFlags) {
    const globalFlagName = globalFlag.name;
    if (!isWhitelistableFeature(globalFlagName)) {
      continue;
    }

    if (
      !workspaceFlagNames.has(globalFlagName) &&
      GlobalFeatureFlagResource.isInRollout(
        workspace.id,
        globalFlag.rolloutPercentage
      )
    ) {
      effectiveFlags.push(globalFlagName);
    }
  }

  return effectiveFlags;
}

export function getFeatureFlags(
  auth: Authenticator
): Promise<WhitelistableFeature[]> {
  return getFeatureFlagsForWorkspace(auth.getNonNullableWorkspace());
}

export async function hasFeatureFlag(
  auth: Authenticator,
  flag: WhitelistableFeature
): Promise<boolean> {
  const flags = await getFeatureFlags(auth);
  return flags.includes(flag);
}

export function getApiKeyNameFromHeaders(headers: {
  [key: string]: string | string[] | undefined;
}) {
  const apiKeyName = headers[DustApiKeyNameHeader];
  if (isString(apiKeyName)) {
    return decodeUtf8HeaderValue(apiKeyName);
  }
  return undefined;
}

export function getApiKeyNameHeader(auth: Authenticator) {
  // Prefer the attribution key name over the request's own key so the original
  // caller's key name propagates transitively through nested internal system-key
  // calls (e.g. a sub-agent that itself spawns sub-agents). Without this, a nested
  // call would forward the system key name ("DustSystemKey") and lose attribution.
  const name = auth.attributionKey()?.name ?? auth.key()?.name;
  if (!name) {
    return undefined;
  }

  // The name may exceed Latin-1 (emoji, non-Latin scripts); DustAPI encodes
  // extra header values on the wire (see @dust-tt/client baseHeaders).
  return {
    [DustApiKeyNameHeader]: name,
  };
}
