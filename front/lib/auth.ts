import { getSession as getAuth0Session } from "@auth0/nextjs-auth0";
import type {
  ACLType,
  Group,
  LightWorkspaceType,
  PermissionType,
  RoleType,
  UserType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type { DustAPICredentials } from "@dust-tt/types";
import type { Result } from "@dust-tt/types";
import type { APIErrorWithStatusCode } from "@dust-tt/types";
import {
  Err,
  groupHasPermission,
  isAdmin,
  isBuilder,
  isDevelopment,
  isUser,
  Ok,
  WHITELISTABLE_FEATURES,
} from "@dust-tt/types";
import * as _ from "lodash";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";

import type { SessionWithUser } from "@app/lib/iam/provider";
import { isValidSession } from "@app/lib/iam/provider";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { Plan, Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { renderSubscriptionFromModels } from "@app/lib/plans/subscription";
import { getTrialVersionForPlan, isTrial } from "@app/lib/plans/trial";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { KeyAuthType } from "@app/lib/resources/key_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

import config from "./api/config";
const { ACTIVATE_ALL_FEATURES_DEV = false } = process.env;

const DUST_INTERNAL_EMAIL_REGEXP = /^[^@]+@dust\.tt$/;

/**
 * This is a class that will be used to check if a user can perform an action on a resource.
 * It acts as a central place to enforce permissioning across all of Dust.
 *
 * It explicitely does not store a reference to the current user to make sure our permissions are
 * workspace oriented. Use `getUserFromSession` if needed.
 */
export class Authenticator {
  _flags: WhitelistableFeature[];
  _key?: KeyAuthType;
  _role: RoleType;
  _subscription: SubscriptionType | null;
  _user: UserResource | null;
  _groups: GroupResource[];
  _workspace: Workspace | null;

  // Should only be called from the static methods below.
  constructor({
    workspace,
    user,
    role,
    subscription,
    flags,
    key,
  }: {
    workspace?: Workspace | null;
    user?: UserResource | null;
    role: RoleType;
    subscription?: SubscriptionType | null;
    flags: WhitelistableFeature[];
    key?: KeyAuthType;
  }) {
    this._workspace = workspace || null;
    this._user = user || null;
    // TODO: Load groups memberships
    this._groups = [];
    this._role = role;
    this._subscription = subscription || null;
    this._flags = flags;
    this._key = key;
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
    let subscription: SubscriptionType | null = null;
    let flags: WhitelistableFeature[] = [];

    if (user && workspace) {
      [role, subscription, flags] = await Promise.all([
        MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace: renderLightWorkspaceType({ workspace }),
        }).then((m) => m?.role ?? "none"),
        subscriptionForWorkspace(renderLightWorkspaceType({ workspace })),
        FeatureFlag.findAll({
          where: {
            workspaceId: workspace.id,
          },
        }).then((flags) => flags.map((flag) => flag.name)),
      ]);
    }

    return new Authenticator({
      workspace,
      user,
      role,
      subscription,
      flags,
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

    let subscription: SubscriptionType | null = null;
    let flags: WhitelistableFeature[] = [];

    if (workspace) {
      [subscription, flags] = await Promise.all([
        subscriptionForWorkspace(renderLightWorkspaceType({ workspace })),
        (async () => {
          return (
            await FeatureFlag.findAll({
              where: {
                workspaceId: workspace?.id,
              },
            })
          ).map((flag) => flag.name);
        })(),
      ]);
    }

    return new Authenticator({
      workspace,
      user,
      role: user?.isDustSuperUser ? "admin" : "none",
      subscription,
      flags,
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
    let subscription: SubscriptionType | null = null;
    let flags: WhitelistableFeature[] = [];

    if (user && workspace) {
      [role, subscription, flags] = await Promise.all([
        MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace: renderLightWorkspaceType({ workspace }),
        }).then((m) => m?.role ?? "none"),
        subscriptionForWorkspace(renderLightWorkspaceType({ workspace })),
        FeatureFlag.findAll({
          where: {
            workspaceId: workspace.id,
          },
        }).then((flags) => flags.map((flag) => flag.name)),
      ]);
    }

    return new Authenticator({
      workspace,
      user,
      role,
      subscription,
      flags,
    });
  }

  /**
   * Get an Authenticator from an API key for a given workspace. Why? because by API you may want to
   * access a workspace that is not the API key's workspace (eg include running another's workspace
   * app (dust-apps))
   * @param key Key the API key
   * @param wId string the target workspaceId
   * @returns an Authenticator for wId and the key's own workspaceId
   */
  static async fromKey(
    key: KeyResource,
    wId: string
  ): Promise<{ auth: Authenticator; keyWorkspaceId: string }> {
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

    let role = "none" as RoleType;
    if (!keyWorkspace) {
      throw new Error("Key workspace not found");
    }
    if (workspace) {
      if (keyWorkspace.id === workspace.id) {
        role = "builder";
      }
    }

    let subscription: SubscriptionType | null = null;
    let flags: WhitelistableFeature[] = [];

    if (workspace) {
      [subscription, flags] = await Promise.all([
        subscriptionForWorkspace(renderLightWorkspaceType({ workspace })),
        (async () => {
          return (
            await FeatureFlag.findAll({
              where: {
                workspaceId: workspace?.id,
              },
            })
          ).map((flag) => flag.name);
        })(),
      ]);
    }

    return {
      auth: new Authenticator({
        workspace,
        role,
        subscription,
        flags,
        key: key.toAuthJSON(),
      }),
      keyWorkspaceId: keyWorkspace.sId,
    };
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

    let subscription: SubscriptionType | null = null;
    let flags: WhitelistableFeature[] = [];

    [subscription, flags] = await Promise.all([
      subscriptionForWorkspace(renderLightWorkspaceType({ workspace })),
      (async () => {
        return (
          await FeatureFlag.findAll({
            where: {
              workspaceId: workspace?.id,
            },
          })
        ).map((flag) => flag.name);
      })(),
    ]);

    return new Authenticator({
      workspace,
      role: "builder",
      subscription,
      flags,
    });
  }

  /* As above, with role `admin` */
  static async internalAdminForWorkspace(
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

    let subscription: SubscriptionType | null = null;
    let flags: WhitelistableFeature[] = [];

    [subscription, flags] = await Promise.all([
      subscriptionForWorkspace(renderLightWorkspaceType({ workspace })),
      (async () => {
        return (
          await FeatureFlag.findAll({
            where: {
              workspaceId: workspace?.id,
            },
          })
        ).map((flag) => flag.name);
      })(),
    ]);

    return new Authenticator({
      workspace,
      role: "admin",
      subscription,
      flags,
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

    const user = await UserResource.fetchByEmail(userEmail);
    // If the user does not exist (e.g., whitelisted email addresses),
    // simply ignore and return null.
    if (!user) {
      return null;
    }

    // Verify that the user has an active membership in the specified workspace.
    const activeMembership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: owner,
      });
    // If the user does not have an active membership in the workspace,
    // simply ignore and return null.
    if (!activeMembership) {
      return null;
    }

    return new Authenticator({
      flags: auth._flags,
      key: auth._key,
      // We limit scope to a user role.
      role: "user",
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
          flags:
            ACTIVATE_ALL_FEATURES_DEV && isDevelopment()
              ? [...WHITELISTABLE_FEATURES]
              : this._flags,
          ssoEnforced: this._workspace.ssoEnforced,
          whiteListedProviders: this._workspace.whiteListedProviders,
          defaultEmbeddingProvider: this._workspace.defaultEmbeddingProvider,
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
    return this._subscription;
  }

  plan(): PlanType | null {
    return this._subscription ? this._subscription.plan : null;
  }

  isUpgraded(): boolean {
    return isUpgraded(this.plan());
  }

  /**
   * This is a convenience method to get the user from the Authenticator. The returned UserType
   * object won't have the user's workspaces set.
   * @returns
   */
  user(): UserType | null {
    return this._user ? this._user.toJSON() : null;
  }

  getNonNullableUser(): UserType {
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

  groups(): Group[] {
    return this._groups ? this._groups.map((group) => group.toJSON()) : [];
  }

  hasPermission(acls: ACLType[], permission: PermissionType): boolean {
    // Does the user belongs to a group which has the required permission on all ACLs ?
    return this.groups().some((group) =>
      acls.every((acl) => groupHasPermission(acl, permission, group.id))
    );
  }

  canRead(acls: ACLType[]): boolean {
    return this.hasPermission(acls, "read");
  }

  canWrite(acls: ACLType[]): boolean {
    return this.hasPermission(acls, "write");
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
 * Retrieves the API Key from the request.
 * @param req NextApiRequest request object
 * @returns Result<Key, APIErrorWithStatusCode>
 */
export async function getAPIKey(
  req: NextApiRequest
): Promise<Result<KeyResource, APIErrorWithStatusCode>> {
  if (!req.headers.authorization) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "missing_authorization_header_error",
        message: "Missing Authorization header",
      },
    });
  }

  const parse = req.headers.authorization.match(/Bearer (sk-[a-zA-Z0-9]+)/);
  if (!parse || !parse[1] || !parse[1].startsWith("sk-")) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "malformed_authorization_header_error",
        message: "Malformed Authorization header",
      },
    });
  }

  const key = await KeyResource.fetchBySecret(parse[1]);

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
 * Construct the SubscriptionType for the provided workspace.
 * @param w WorkspaceType the workspace to get the plan for
 * @returns SubscriptionType
 */
export async function subscriptionForWorkspace(
  workspace: LightWorkspaceType
): Promise<SubscriptionType> {
  const res = await subscriptionForWorkspaces([workspace]);

  const subscription = res[workspace.sId];
  if (!subscription) {
    throw new Error(
      `Could not find subscription for workspace ${workspace.sId}`
    );
  }

  return subscription;
}

/**
 * Construct the SubscriptionType for the provided workspaces.
 * @param w WorkspaceType the workspace to get the plan for
 * @returns SubscriptionType
 */
export async function subscriptionForWorkspaces(
  workspaces: LightWorkspaceType[]
): Promise<{ [key: string]: SubscriptionType }> {
  const workspaceModelBySid = _.keyBy(workspaces, "sId");

  const activeSubscriptionByWorkspaceId = _.keyBy(
    await Subscription.findAll({
      attributes: [
        "endDate",
        "id",
        "paymentFailingSince",
        "sId",
        "startDate",
        "status",
        "stripeSubscriptionId",
        "trialing",
        "workspaceId",
      ],
      where: {
        workspaceId: Object.values(workspaceModelBySid).map((w) => w.id),
        status: "active",
      },
      include: [
        {
          model: Plan,
          as: "plan",
          required: true,
        },
      ],
    }),
    "workspaceId"
  );

  const renderedSubscriptionByWorkspaceSid: Record<string, SubscriptionType> =
    {};

  for (const [sId, workspace] of Object.entries(workspaceModelBySid)) {
    const activeSubscription =
      activeSubscriptionByWorkspaceId[workspace.id.toString()];

    // Default values when no subscription
    let plan: PlanAttributes = FREE_NO_PLAN_DATA;

    if (activeSubscription) {
      // If the subscription is in trial, temporarily override the plan until the FREE_TEST_PLAN is phased out.
      if (isTrial(activeSubscription)) {
        plan = getTrialVersionForPlan(activeSubscription.plan);
      } else if (activeSubscription.plan) {
        plan = activeSubscription.plan;
      } else {
        logger.error(
          {
            workspaceId: sId,
            activeSubscription,
          },
          "Cannot find plan for active subscription. Will use limits of FREE_TEST_PLAN instead. Please check and fix."
        );
      }
    }

    renderedSubscriptionByWorkspaceSid[sId] = renderSubscriptionFromModels({
      plan,
      activeSubscription,
    });
  }

  return renderedSubscriptionByWorkspaceSid;
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
    key = await KeyResource.makeNew({
      workspaceId: workspace.id,
      isSystem: true,
      status: "active",
    });
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
): Promise<DustAPICredentials> {
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
