import { getSession as getAuth0Session } from "@auth0/nextjs-auth0";
import memoizer from "lru-memoizer";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";

import type { Auth0JwtPayload } from "@app/lib/api/auth0";
import { getUserFromAuth0Token } from "@app/lib/api/auth0";
import config from "@app/lib/api/config";
import { SSOEnforcedError } from "@app/lib/iam/errors";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { isValidSession } from "@app/lib/iam/provider";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { Workspace } from "@app/lib/models/workspace";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { KeyAuthType } from "@app/lib/resources/key_resource";
import {
  KeyResource,
  SECRET_KEY_PREFIX,
} from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  APIErrorWithStatusCode,
  GroupType,
  LightWorkspaceType,
  PermissionType,
  PlanType,
  ResourcePermission,
  Result,
  RoleType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import {
  Err,
  hasRolePermissions,
  isAdmin,
  isBuilder,
  isDevelopment,
  isSupportedEnterpriseConnectionStrategy,
  isUser,
  Ok,
  WHITELISTABLE_FEATURES,
} from "@app/types";

const { ACTIVATE_ALL_FEATURES_DEV = false } = process.env;

const DUST_INTERNAL_EMAIL_REGEXP = /^[^@]+@dust\.tt$/;

export type PublicAPIAuthMethod = "api_key" | "access_token";

export const getAuthType = (token: string): PublicAPIAuthMethod => {
  return token.startsWith(SECRET_KEY_PREFIX) ? "api_key" : "access_token";
};

/**
 * This is a class that will be used to check if a user can perform an action on a resource.
 * It acts as a central place to enforce permissioning across all of Dust.
 *
 * It explicitely does not store a reference to the current user to make sure our permissions are
 * workspace oriented. Use `getUserFromSession` if needed.
 */
export class Authenticator {
  _key?: KeyAuthType;
  _role: RoleType;
  _subscription: SubscriptionResource | null;
  _user: UserResource | null;
  _groups: GroupResource[];
  _workspace: Workspace | null;

  // Should only be called from the static methods below.
  constructor({
    workspace,
    user,
    role,
    groups,
    subscription,
    key,
  }: {
    workspace?: Workspace | null;
    user?: UserResource | null;
    role: RoleType;
    groups: GroupResource[];
    subscription?: SubscriptionResource | null;
    key?: KeyAuthType;
  }) {
    this._workspace = workspace || null;
    this._user = user || null;
    this._groups = groups;
    this._role = role;
    this._subscription = subscription || null;
    this._key = key;
  }

  /**
   * Converts an array of arrays of group sIDs into ResourcePermission objects.
   *
   * This utility method creates standard read/write permissions for each group.
   *
   * Permission logic:
   * - A user must belong to AT LEAST ONE group from EACH sub-array.
   *   Each sub-array creates a ResourcePermission entry that can be satisfied by ANY of its groups.
   *   Example: [[1,2], [3,4]] means (1 OR 2) AND (3 OR 4)
   *
   * @param groupIds - Array of arrays of group string identifiers
   * @returns Array of ResourcePermission objects, one entry per sub-array
   */
  static createResourcePermissionsFromGroupIds(
    groupIds: string[][]
  ): ResourcePermission[] {
    const getIdFromSIdOrThrow = (groupId: string) => {
      const id = getResourceIdFromSId(groupId);
      if (!id) {
        throw new Error(`Unexpected: Could not find id for group ${groupId}`);
      }
      return id;
    };

    // Each group in the same entry enforces OR relationship.
    return groupIds.map((group) => ({
      groups: group.map((groupId) => ({
        id: getIdFromSIdOrThrow(groupId),
        permissions: ["read", "write"],
      })),
    }));
  }

  /**
   * Get a an Authenticator for the target workspace associated with the authentified user from the
   * Auth0 session.
   *
   * @param session any Auth0 session
   * @param wId string target workspace id
   * @returns Promise<Authenticator>
   */
  static async fromSession(
    session: SessionWithUser | null,
    wId: string
  ): Promise<Authenticator> {
    const [workspace, user] = await Promise.all([
      (async () => {
        return Workspace.findOne({
          where: {
            sId: wId,
          },
        });
      })(),
      (async () => {
        if (!session) {
          return null;
        } else {
          return UserResource.fetchByAuth0Sub(session.user.sub);
        }
      })(),
    ]);

    let role = "none" as RoleType;
    let groups: GroupResource[] = [];
    let subscription: SubscriptionResource | null = null;

    if (user && workspace) {
      [role, groups, subscription] = await Promise.all([
        MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace: renderLightWorkspaceType({ workspace }),
        }).then((m) => m?.role ?? "none"),
        GroupResource.listUserGroupsInWorkspace({
          user,
          workspace: renderLightWorkspaceType({ workspace }),
        }),
        SubscriptionResource.fetchActiveByWorkspace(
          renderLightWorkspaceType({ workspace })
        ),
      ]);
    }

    return new Authenticator({
      workspace,
      user,
      role,
      groups,
      subscription,
    });
  }

  /**
   * Get a an Authenticator for the target workspace and the authentified Super User user from the
   * Auth0 session.
   * Super User will have `role` set to `admin` regardless of their actual role in the workspace.
   *
   * @param session any Auth0 session
   * @param wId string target workspace id
   * @returns Promise<Authenticator>
   */
  static async fromSuperUserSession(
    session: SessionWithUser | null,
    wId: string | null
  ): Promise<Authenticator> {
    const [workspace, user] = await Promise.all([
      (async () => {
        if (!wId) {
          return null;
        }
        return Workspace.findOne({
          where: {
            sId: wId,
          },
        });
      })(),
      (async () => {
        if (!session) {
          return null;
        } else {
          return UserResource.fetchByAuth0Sub(session.user.sub);
        }
      })(),
    ]);

    let groups: GroupResource[] = [];
    let subscription: SubscriptionResource | null = null;

    if (workspace) {
      [groups, subscription] = await Promise.all([
        user?.isDustSuperUser
          ? GroupResource.internalFetchAllWorkspaceGroups(workspace.id)
          : [],
        SubscriptionResource.fetchActiveByWorkspace(
          renderLightWorkspaceType({ workspace })
        ),
      ]);
    }

    return new Authenticator({
      workspace,
      user,
      role: user?.isDustSuperUser ? "admin" : "none",
      groups,
      subscription,
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
    wId: string
  ): Promise<Authenticator> {
    const [workspace, user] = await Promise.all([
      Workspace.findOne({
        where: {
          sId: wId,
        },
      }),
      UserResource.fetchById(uId),
    ]);

    let role: RoleType = "none";
    let groups: GroupResource[] = [];
    let subscription: SubscriptionResource | null = null;

    if (user && workspace) {
      [role, groups, subscription] = await Promise.all([
        MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace: renderLightWorkspaceType({ workspace }),
        }).then((m) => m?.role ?? "none"),
        GroupResource.listUserGroupsInWorkspace({
          user,
          workspace: renderLightWorkspaceType({ workspace }),
        }),
        SubscriptionResource.fetchActiveByWorkspace(
          renderLightWorkspaceType({ workspace })
        ),
      ]);
    }

    return new Authenticator({
      workspace,
      user,
      role,
      groups,
      subscription,
    });
  }

  /**
   * Get an Authenticator from an auth0 token a given workspace.
   * This is to be used from the extension, calling our public API.
   * @param key The Auth0 token
   * @param wId string the target workspaceId
   * @returns an Authenticator for wId and the key's own workspaceId
   */
  static async fromAuth0Token({
    token,
    wId,
  }: {
    token: Auth0JwtPayload;
    wId: string;
  }): Promise<
    Result<
      Authenticator,
      {
        code: "user_not_found" | "workspace_not_found" | "sso_enforced";
      }
    >
  > {
    const user = await getUserFromAuth0Token(token);
    if (!user) {
      return new Err({ code: "user_not_found" });
    }

    const workspace = await Workspace.findOne({
      where: {
        sId: wId,
      },
    });
    if (!workspace) {
      return new Err({ code: "workspace_not_found" });
    }

    const strategy =
      token[`${config.getAuth0NamespaceClaim()}connection.strategy`];
    if (
      workspace.ssoEnforced &&
      strategy &&
      !isSupportedEnterpriseConnectionStrategy(strategy)
    ) {
      return new Err(
        new SSOEnforcedError(
          "Access requires Single Sign-On (SSO) authentication. Use your SSO provider to sign in.",
          workspace.sId
        )
      );
    }

    let role = "none" as RoleType;
    let groups: GroupResource[] = [];
    let subscription: SubscriptionResource | null = null;

    [role, groups, subscription] = await Promise.all([
      MembershipResource.getActiveMembershipOfUserInWorkspace({
        user: user,
        workspace: renderLightWorkspaceType({ workspace }),
      }).then((m) => m?.role ?? "none"),
      GroupResource.listUserGroupsInWorkspace({
        user,
        workspace: renderLightWorkspaceType({ workspace }),
      }),
      SubscriptionResource.fetchActiveByWorkspace(
        renderLightWorkspaceType({ workspace })
      ),
    ]);

    return new Ok(
      new Authenticator({
        workspace,
        groups,
        user,
        role,
        subscription,
      })
    );
  }

  /**
   * Returns two Authenticators, one for the workspace associated with the key and one for the
   * workspace provided as an argument.
   *
   * @param key Key the API key
   * @param wId the target workspaceId
   * @returns Promise<{ workspaceAuth: Authenticator, keyAuth: Authenticator }>
   */
  static async fromKey(
    key: KeyResource,
    wId: string,
    requestedGroupIds?: string[]
  ): Promise<{
    workspaceAuth: Authenticator;
    keyAuth: Authenticator;
  }> {
    const [workspace, keyWorkspace] = await Promise.all([
      (async () => {
        return Workspace.findOne({
          where: {
            sId: wId,
          },
        });
      })(),
      (async () => {
        return Workspace.findOne({
          where: {
            id: key.workspaceId,
          },
        });
      })(),
    ]);

    if (!keyWorkspace) {
      throw new Error("Key workspace not found");
    }

    let role = "none" as RoleType;
    const isKeyWorkspace = keyWorkspace.id === workspace?.id;
    if (isKeyWorkspace) {
      // System keys have admin role on their workspace.
      if (key.isSystem) {
        role = "admin";
      } else {
        role = "builder";
      }
    }

    const getSubscriptionForWorkspace = (workspace: Workspace) =>
      SubscriptionResource.fetchActiveByWorkspace(
        renderLightWorkspaceType({ workspace })
      );

    let keyGroups: GroupResource[] = [];
    let requestedGroups: GroupResource[] = [];
    let workspaceSubscription: SubscriptionResource | null = null;
    let keySubscription: SubscriptionResource | null = null;

    if (workspace) {
      [keyGroups, requestedGroups, keySubscription, workspaceSubscription] =
        await Promise.all([
          // Key related attributes.
          GroupResource.listWorkspaceGroupsFromKey(key),
          requestedGroupIds
            ? GroupResource.listGroupsWithSystemKey(key, requestedGroupIds)
            : [],
          getSubscriptionForWorkspace(keyWorkspace),
          // Workspace related attributes.
          getSubscriptionForWorkspace(workspace),
        ]);
    }

    const allGroups = Object.entries(
      keyGroups.concat(requestedGroups).reduce(
        (acc, group) => {
          acc[group.id] = group;
          return acc;
        },
        {} as Record<string, GroupResource>
      )
    ).map(([, group]) => group);

    return {
      workspaceAuth: new Authenticator({
        // If the key is associated with the workspace, we associate the groups.
        groups: isKeyWorkspace ? allGroups : [],
        key: key.toAuthJSON(),
        role,
        subscription: workspaceSubscription,
        workspace,
      }),
      keyAuth: new Authenticator({
        groups: allGroups,
        key: key.toAuthJSON(),
        role: "builder",
        subscription: keySubscription,
        workspace: keyWorkspace,
      }),
    };
  }

  // /!\ This method is intended exclusively for use within the registry lookup context.
  // It securely authenticates access by verifying a provided secret against the
  // configured registry secret. If the secret is valid, it retrieves the specified
  // workspace and its associated group resources using a system API key.
  // Modifications to this method should be handled with caution, as it involves
  // sensitive operations related to secret validation and workspace access.
  static async fromRegistrySecret({
    groupIds,
    secret,
    workspaceId,
  }: {
    groupIds: string[];
    secret: string;
    workspaceId: string;
  }) {
    if (secret !== config.getDustRegistrySecret()) {
      throw new Error("Invalid secret for registry lookup");
    }

    const workspace = await Workspace.findOne({
      where: {
        sId: workspaceId,
      },
    });
    if (!workspace) {
      throw new Error(`Could not find workspace with sId ${workspaceId}`);
    }

    // We use the system key for the workspace to fetch the groups.
    const systemKeyForWorkspaceRes = await getOrCreateSystemApiKey(
      renderLightWorkspaceType({ workspace })
    );
    if (systemKeyForWorkspaceRes.isErr()) {
      throw new Error(`Could not get system key for workspace ${workspaceId}`);
    }

    const groups = await GroupResource.listGroupsWithSystemKey(
      systemKeyForWorkspaceRes.value,
      groupIds
    );

    return new Authenticator({
      groups,
      role: "builder",
      subscription: null,
      workspace,
    });
  }

  /**
   * Creates an Authenticator for a given workspace (with role `builder`). Used for internal calls
   * to the Dust API or other functions, when the system is calling something for the workspace.
   * @param workspaceId string
   */
  static async internalBuilderForWorkspace(
    workspaceId: string
  ): Promise<Authenticator> {
    const workspace = await Workspace.findOne({
      where: {
        sId: workspaceId,
      },
    });
    if (!workspace) {
      throw new Error(`Could not find workspace with sId ${workspaceId}`);
    }

    let globalGroup: GroupResource | null = null;
    let subscription: SubscriptionResource | null = null;

    [globalGroup, subscription] = await Promise.all([
      GroupResource.internalFetchWorkspaceGlobalGroup(workspace.id),
      SubscriptionResource.fetchActiveByWorkspace(
        renderLightWorkspaceType({ workspace })
      ),
    ]);

    return new Authenticator({
      workspace,
      role: "builder",
      groups: globalGroup ? [globalGroup] : [],
      subscription,
    });
  }

  /* As above, with role `admin`. Use requestAllGroups with care as it gives access to all groups
   * within the workpsace. */
  static async internalAdminForWorkspace(
    workspaceId: string,
    options?: { dangerouslyRequestAllGroups: boolean }
  ): Promise<Authenticator> {
    const workspace = await Workspace.findOne({
      where: {
        sId: workspaceId,
      },
    });
    if (!workspace) {
      throw new Error(`Could not find workspace with sId ${workspaceId}`);
    }

    const [groups, subscription] = await Promise.all([
      (async () => {
        if (options?.dangerouslyRequestAllGroups) {
          return GroupResource.internalFetchAllWorkspaceGroups(workspace.id);
        } else {
          const globalGroup =
            await GroupResource.internalFetchWorkspaceGlobalGroup(workspace.id);
          return globalGroup ? [globalGroup] : [];
        }
      })(),
      SubscriptionResource.fetchActiveByWorkspace(
        renderLightWorkspaceType({ workspace })
      ),
    ]);

    return new Authenticator({
      workspace,
      role: "admin",
      groups,
      subscription,
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

    const groups = await GroupResource.listUserGroupsInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace: owner }),
    });

    return new Authenticator({
      key: auth._key,
      // We limit scope to a user role.
      role: "user",
      groups,
      user,
      subscription: auth._subscription,
      workspace: auth._workspace,
    });
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

  isAdmin(): boolean {
    return isAdmin(this.workspace());
  }

  isSystemKey(): boolean {
    return !!this._key?.isSystem;
  }

  workspace(): WorkspaceType | null {
    return this._workspace
      ? {
          id: this._workspace.id,
          sId: this._workspace.sId,
          name: this._workspace.name,
          role: this._role,
          segmentation: this._workspace.segmentation || null,
          ssoEnforced: this._workspace.ssoEnforced,
          whiteListedProviders: this._workspace.whiteListedProviders,
          defaultEmbeddingProvider: this._workspace.defaultEmbeddingProvider,
          metadata: this._workspace.metadata,
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
    if (!this._user) {
      return false;
    }

    const { email, isDustSuperUser = false } = this._user;
    const isDustInternal =
      isDevelopment() || DUST_INTERNAL_EMAIL_REGEXP.test(email);

    return isDustInternal && isDustSuperUser;
  }

  groups(): GroupType[] {
    return this._groups.map((g) => g.toJSON());
  }

  /**
   * Checks if the user has the specified permission across all resource permissions.
   *
   * This method applies a conjunction (AND) over all resource permission entries. The user
   * must have the required permission in EVERY entry for the check to pass.
   */
  hasPermissionForAllResources(
    resourcePermissions: ResourcePermission[],
    permission: PermissionType
  ): boolean {
    // Apply conjunction (AND) over all resource permission entries.
    return resourcePermissions.every((rp) =>
      this.hasResourcePermission(rp, permission)
    );
  }

  /**
   * Determines if a user has a specific permission on a resource based on their role and group
   * memberships.
   *
   * The permission check follows two independent paths (OR):
   *
   * 1. Role-based permission check:
   *    Applies when the resource has role-based permissions configured.
   *    Permission is granted if:
   *    - The resource has public access (role="none") for the requested permission, OR
   *    - The user's role has the required permission AND the resource belongs to user's workspace
   *
   * 2. Group-based permission check:
   *    Applies when the resource has group-based permissions configured.
   *    Permission is granted if:
   *    - The user belongs to a group that has the required permission on this resource
   *
   * @param resourcePermission - The resource's permission configuration
   * @param permission - The specific permission being checked
   * @returns true if either permission path grants access
   */
  private hasResourcePermission(
    resourcePermission: ResourcePermission,
    permission: PermissionType
  ): boolean {
    // First path: Role-based permission check.
    if (hasRolePermissions(resourcePermission)) {
      const workspace = this.getNonNullableWorkspace();

      // Check for public access first. Only case of cross-workspace permission.
      const publicPermission = resourcePermission.roles
        .find((r) => r.role === "none")
        ?.permissions.includes(permission);
      if (publicPermission) {
        return true;
      }

      // Check workspace-specific role permissions.
      const hasRolePermission = resourcePermission.roles.some(
        (r) => this.role() === r.role && r.permissions.includes(permission)
      );

      if (
        hasRolePermission &&
        workspace.id === resourcePermission.workspaceId
      ) {
        return true;
      }
    }

    // Second path: Group-based permission check.
    return this.groups().some((userGroup) =>
      resourcePermission.groups.some(
        (gp) => gp.id === userGroup.id && gp.permissions.includes(permission)
      )
    );
  }

  canAdministrate(resourcePermissions: ResourcePermission[]): boolean {
    return this.hasPermissionForAllResources(resourcePermissions, "admin");
  }

  canRead(resourcePermissions: ResourcePermission[]): boolean {
    return this.hasPermissionForAllResources(resourcePermissions, "read");
  }

  canWrite(resourcePermissions: ResourcePermission[]): boolean {
    return this.hasPermissionForAllResources(resourcePermissions, "write");
  }

  key(): KeyAuthType | null {
    return this._key ?? null;
  }
}

/**
 * Retrieves the Auth0 session from the request/response.
 * @param req NextApiRequest request object
 * @param res NextApiResponse response object
 * @returns Promise<any>
 */
export async function getSession(
  req: NextApiRequest | GetServerSidePropsContext["req"],
  res: NextApiResponse | GetServerSidePropsContext["res"]
): Promise<SessionWithUser | null> {
  const session = await getAuth0Session(req, res);
  if (!session || !isValidSession(session)) {
    return null;
  }

  return session;
}

/**
 * Gets the Bearer token from the request.
 * @param req
 * @returns
 */
export async function getBearerToken(
  req: NextApiRequest
): Promise<Result<string, APIErrorWithStatusCode>> {
  if (!req.headers.authorization) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "missing_authorization_header_error",
        message: "Missing Authorization header",
      },
    });
  }

  const parse = req.headers.authorization.match(
    /^Bearer\s+([A-Za-z0-9-._~+/]+=*)$/i
  );
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

/**
 * Retrieves the API Key from the request.
 * @param req NextApiRequest request object
 * @returns Result<Key, APIErrorWithStatusCode>
 */
export async function getAPIKey(
  req: NextApiRequest
): Promise<Result<KeyResource, APIErrorWithStatusCode>> {
  const token = await getBearerToken(req);

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
      },
      group
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

export const getFeatureFlags = memoizer.sync({
  load: async (workspace: WorkspaceType): Promise<WhitelistableFeature[]> => {
    if (ACTIVATE_ALL_FEATURES_DEV && isDevelopment()) {
      return [...WHITELISTABLE_FEATURES];
    } else {
      const res = await FeatureFlag.findAll({
        where: { workspaceId: workspace.id },
      });
      return res.map((flag) => flag.name);
    }
  },

  hash: function (workspace: WorkspaceType) {
    return `feature_flags_${workspace.id}`;
  },

  itemMaxAge: () => 3000,
});
