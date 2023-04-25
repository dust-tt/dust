import {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { getServerSession } from "next-auth/next";
import { Op } from "sequelize";

import { APIErrorWithStatusCode } from "@app/lib/error";
import { Err, Ok, Result } from "@app/lib/result";
import { new_id } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { PlanType, UserType, WorkspaceType } from "@app/types/user";

import { Key, Membership, User, Workspace } from "./models";

export type RoleType = "admin" | "builder" | "user" | "none";

/**
 * This is a class that will be used to check if a user can perform an action on a resource.
 * It acts as a central place to enforce permissioning across all of Dust.
 * In the future once we have Workspace the logic of resolving membership of a workspace and
 * associated permission will be implemented here.
 */
export class Authenticator {
  _workspace: Workspace | null;
  _role: RoleType;

  constructor(workspace: Workspace | null, role: RoleType) {
    this._workspace = workspace;
    this._role = role;
  }

  /**
   * Get a an Authenticator for the target workspace associated with the authentified user from the
   * NextAuth session.
   *
   * @param session any NextAuth session
   * @param wId string target workspace id
   * @returns Promise<Authenticator>
   */
  static async fromSession(session: any, wId: string): Promise<Authenticator> {
    const [workspace, user] = await Promise.all([
      (async () => {
        return await Workspace.findOne({
          where: {
            sId: wId,
          },
        });
      })(),
      (async () => {
        if (!session) {
          return null;
        } else {
          return await User.findOne({
            where: {
              provider: session.provider.provider,
              providerId: session.provider.id.toString(),
            },
          });
        }
      })(),
    ]);

    let role = "none" as RoleType;

    if (user && workspace) {
      const membership = await Membership.findOne({
        where: {
          userId: user.id,
          workspaceId: workspace.id,
        },
      });

      if (membership) {
        switch (membership.role) {
          case "admin":
          case "builder":
          case "user":
            role = membership.role;
            break;
          default:
            role = "none";
        }
      }
    }

    return new Authenticator(workspace, role);
  }

  static async fromKey(key: Key, wId: string): Promise<Authenticator> {
    const [workspace, keyWorkspace] = await Promise.all([
      (async () => {
        return await Workspace.findOne({
          where: {
            sId: wId,
          },
        });
      })(),
      (async () => {
        return await Workspace.findOne({
          where: {
            id: key.workspaceId,
          },
        });
      })(),
    ]);

    let role = "none" as RoleType;

    if (workspace && keyWorkspace) {
      if (keyWorkspace.id === workspace.id) {
        role = "builder";
      }
    }

    return new Authenticator(workspace, role);
  }

  role(): RoleType {
    return this._role;
  }

  isUser(): boolean {
    switch (this._role) {
      case "admin":
      case "builder":
      case "user":
        return true;
      default:
        return false;
    }
  }

  isBuilder(): boolean {
    switch (this._role) {
      case "admin":
      case "builder":
        return true;
      default:
        return false;
    }
  }

  isAdmin(): boolean {
    switch (this._role) {
      case "admin":
        return true;
      default:
        return false;
    }
  }

  workspace(): WorkspaceType | null {
    return this._workspace
      ? {
          id: this._workspace.id,
          uId: this._workspace.uId,
          sId: this._workspace.sId,
          name: this._workspace.name,
          allowedDomain: this._workspace.allowedDomain || null,
          type: this._workspace.type,
          role: this._role,
          plan: planForWorkspace(this._workspace),
        }
      : null;
  }
}

/**
 * Retrieves the NextAuth session from the request/response.
 * @param req NextApiRequest request object
 * @param res NextApiResponse response object
 * @returns Promise<any>
 */
export async function getSession(
  req: NextApiRequest | GetServerSidePropsContext["req"],
  res: NextApiResponse | GetServerSidePropsContext["res"]
): Promise<any> {
  return await getServerSession(req, res, authOptions);
}

/**
 * Retrieves the user for a given session
 * @param session any NextAuth session
 * @returns Promise<UserType | null>
 */
export async function getUserFromSession(
  session: any
): Promise<UserType | null> {
  if (!session) {
    return null;
  }

  const user = await User.findOne({
    where: {
      provider: session.provider.provider,
      providerId: session.provider.id.toString(),
    },
  });

  if (!user) {
    return null;
  }

  const memberships = await Membership.findAll({
    where: {
      userId: user.id,
      role: { [Op.in]: ["admin", "builder", "user"] },
    },
  });
  const workspaces = await Workspace.findAll({
    where: {
      id: memberships.map((m) => m.workspaceId),
    },
  });

  return {
    id: user.id,
    provider: user.provider,
    providerId: user.providerId,
    username: user.username,
    email: user.email,
    name: user.name,
    image: session.user ? session.user.image : null,
    workspaces: workspaces.map((w) => {
      let m = memberships.find((m) => m.workspaceId === w.id);
      let role = "none" as RoleType;
      if (m) {
        switch (m.role) {
          case "admin":
          case "builder":
          case "user":
            role = m.role;
            break;
          default:
            role = "none";
        }
      }
      return {
        id: w.id,
        uId: w.uId,
        sId: w.sId,
        name: w.name,
        allowedDomain: w.allowedDomain || null,
        type: w.type,
        role,
        plan: planForWorkspace(w),
      };
    }),
  };
}

/**
 * Retrieves the API Key from the request.
 * @param req NextApiRequest request object
 * @returns Result<Key, APIErrorWithStatusCode>
 */
export async function getAPIKey(
  req: NextApiRequest
): Promise<Result<Key, APIErrorWithStatusCode>> {
  if (!req.headers.authorization) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "missing_authorization_header_error",
        message: "Missing Authorization header",
      },
    });
  }

  let parse = req.headers.authorization.match(/Bearer (sk-[a-zA-Z0-9]+)/);
  if (!parse || !parse[1] || !parse[1].startsWith("sk-")) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "malformed_authorization_header_error",
        message: "Malformed Authorization header",
      },
    });
  }

  let [key] = await Promise.all([
    Key.findOne({
      where: {
        secret: parse[1],
      },
    }),
  ]);

  if (!key || key.status !== "active") {
    return new Err({
      status_code: 401,
      api_error: {
        type: "invalid_api_key_error",
        message: "The API key provided is invalid or disabled.",
      },
    });
  }

  return new Ok(key);
}

const DEFAULT_DATASOURCES_COUNT_LIMIT = 1;
const DEFAULT_DATASOURCES_DOCUMENTS_COUNT_LIMIT = 32;
const DEFAULT_DATASOURCES_DOCUMENTS_SIZE_MB_LIMIT = 1;

/**
 * Construct the PlanType for the provided workspace.
 * @param w WorkspaceType the workspace to get the plan for
 * @returns PlanType
 */
export function planForWorkspace(w: Workspace): PlanType {
  let limits = {
    dataSources: {
      count: DEFAULT_DATASOURCES_COUNT_LIMIT,
      documents: {
        count: DEFAULT_DATASOURCES_DOCUMENTS_COUNT_LIMIT,
        sizeMb: DEFAULT_DATASOURCES_DOCUMENTS_SIZE_MB_LIMIT,
      },
      managed: false,
    },
  };

  if (w.plan) {
    let plan = {} as any;
    try {
      plan = JSON.parse(w.plan) as any;
    } catch (e) {
      logger.error({ planJSON: w.plan, error: e }, "Error parsing plan JSON");
    }

    if (plan.limits) {
      if (plan.limits.dataSources) {
        if (
          plan.limits.dataSources.count &&
          typeof plan.limits.dataSources.count === "number"
        ) {
          limits.dataSources.count = plan.limits.dataSources.count;
        }
        if (plan.limits.dataSources.documents) {
          if (
            plan.limits.dataSources.documents.count &&
            typeof plan.limits.dataSources.documents.count === "number"
          ) {
            limits.dataSources.documents.count =
              plan.limits.dataSources.documents.count;
          }
          if (
            plan.limits.dataSources.documents.sizeMb &&
            typeof plan.limits.dataSources.documents.sizeMb === "number"
          ) {
            limits.dataSources.documents.sizeMb =
              plan.limits.dataSources.documents.sizeMb;
          }
        }
        if (
          plan.limits.dataSources.managed &&
          typeof plan.limits.dataSources.managed === "boolean"
        ) {
          limits.dataSources.managed = plan.limits.dataSources.managed;
        }
      }
    }
  }

  return {
    limits,
  };
}

/**
 * Retrieves or create a system API key for a given workspace
 * @param workspace WorkspaceType
 * @returns Promise<Result<Key, Error>>
 */
export async function getOrCreateSystemApiKey(
  workspace: WorkspaceType
): Promise<Result<Key, Error>> {
  let key = await Key.findOne({
    where: {
      workspaceId: workspace.id,
      isSystem: true,
    },
  });
  if (!key) {
    let secret = `sk-${new_id().slice(0, 32)}`;
    key = await Key.create({
      workspaceId: workspace.id,
      isSystem: true,
      secret: secret,
      status: "active",
    });
  }
  if (!key) {
    return new Err(new Error("Failed to create system key"));
  }

  return new Ok(key);
}
