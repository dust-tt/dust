import { APIErrorWithStatusCode } from "@app/lib/error";
import { Err, Ok, Result } from "@app/lib/result";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { UserType } from "@app/types/user";
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { App, DataSource, Key, User } from "./models";

export enum Role {
  Owner = "owner",
  ReadOnly = "read_only",
}

/**
 * This is a class that will be used to check if a user can perform an action on a resource.
 * It acts as a central place to enforce permissioning across all of Dust.
 * In the future once we have Workspace the logic of resolving membership of a workspace and
 * associated permission will be implemented here.
 */
export class Authenticator {
  _authUser: User | null;
  _session: any;

  constructor(authUser: User | null, session: any = null) {
    this._authUser = authUser;
    this._session = session;
  }

  /**
   * The caller should ensure that the user is authenticated before calling this method.
   *
   * @returns the authenticated user or throws an error if the user is not authenticated.
   */
  user(): UserType {
    return {
      id: this._authUser!.id,
      provider: "github",
      providerId: this._authUser!.githubId,
      username: this._authUser!.username,
      email: this._authUser!.email,
      name: this._authUser!.name,
    };
  }

  session(): any {
    return this._session;
  }

  isAnonymous(): boolean {
    return this._authUser === null;
  }

  /**
   * There is no workspace yet but eventually we'll have a workspace model and this will be used to
   * check if the user is a member of the workspace.
   *
   * @param resourceOwner the owner of the resource for which we want to check the role. This will
   * be replaced by a workspace in the future.
   * @returns the role of the authenticated user.
   */
  async roleFor(resourceOwner: User): Promise<Role> {
    if (resourceOwner.id === this._authUser?.id) {
      return Role.Owner;
    } else {
      return Role.ReadOnly;
    }
  }

  /**
   * Any user can run a `public` or `unlisted` app. Only the owner can read a `private` app.
   *
   * @param app the app for which we check the read rights
   * @returns true if the user can read the app, false otherwise.
   */
  canReadApp(app: App): boolean {
    switch (app.visibility) {
      case "private":
      case "deleted":
        return this._authUser?.id === app.userId;
      case "public":
      case "unlisted":
        return true;
      default:
        return false;
    }
  }

  /**
   * Only the owner can edit an app.
   *
   * @param app the app for which we check the edit rights
   * @returns true if the user can edit the app, false otherwise.
   */
  canEditApp(app: App): boolean {
    return this._authUser?.id === app.userId;
  }

  /**
   * Only the owner of an app can run it. This is an artificial restriction due to the fact that we
   * don't have `front` side `Run` objects. If we allowed anyone to run an app, the "Logs" panel of
   * a user would see `Runs` from other user which is not desirable.
   *
   * Once we introduce a `front` side `Run` object, we can remove this restriction and allow anyone
   * to run a public app with their own credentials. This will enable use to have the "Use" and
   * "Logs" panels available to any logged-in user.
   *
   * @param app the app for which we check the run rights
   * @returns true if the user can run the app, false otherwise.
   */
  isAppOwner(app: App): boolean {
    return this._authUser?.id === app.userId;
  }

  /**
   * Any user can read a `public` data source. Only the owner can read a `private` data source.
   *
   * @param dataSource the data source for which we check the read rights
   * @returns true if the user can read the data source, false otherwise.
   */
  canReadDataSource(dataSource: DataSource): boolean {
    switch (dataSource.visibility) {
      case "public":
        return true;
      case "private":
        return this._authUser?.id === dataSource.userId;
      default:
        return false;
    }
  }

  /**
   * Only the owner can edit a data source.
   *
   * @param dataSource the data source for which we check the edit rights
   * @returns true if the user can edit the data source, false otherwise.
   */
  canEditDataSource(dataSource: DataSource): boolean {
    return this._authUser?.id === dataSource.userId;
  }
}

/**
 * Get a an Authenticator assiciated with the authentified user from the nextauth session.
 *
 * @param req NextApiRequest request object
 * @param res NextApiResponse response object
 * @returns Result<Authenticator, InternalErrorWithStatusCode>
 */
export async function auth_user(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Result<Authenticator, APIErrorWithStatusCode>> {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return new Ok(new Authenticator(null));
  }

  let authUser = await User.findOne({
    where: {
      githubId: session.provider.id.toString(),
    },
  });

  if (!authUser) {
    return new Err({
      status_code: 404,
      api_error: {
        error: {
          type: "user_not_found",
          message: "User associated with the session was not found",
        },
      },
    });
  }

  return new Ok(new Authenticator(authUser, session));
}

/**
 * Get a an Authenticator assiciated with the authentified user from the Authorization Bearer
 * header.
 * @param req NextApiRequest request object
 * @returns Result<Authenticator, HTTPError>
 */
export async function auth_api_user(
  req: NextApiRequest
): Promise<Result<Authenticator, APIErrorWithStatusCode>> {
  if (!req.headers.authorization) {
    return new Err({
      status_code: 401,
      api_error: {
        error: {
          type: "missing_authorization_header_error",
          message: "Missing Authorization header",
        },
      },
    });
  }

  let parse = req.headers.authorization.match(/Bearer (sk-[a-zA-Z0-9]+)/);
  if (!parse || !parse[1]) {
    return new Err({
      status_code: 401,
      api_error: {
        error: {
          type: "malformed_authorization_header_error",
          message: "Malformed Authorization header",
        },
      },
    });
  }
  let secret = parse[1];

  let [key] = await Promise.all([
    Key.findOne({
      where: {
        secret: secret,
      },
    }),
  ]);

  if (!key || key.status !== "active") {
    return new Err({
      status_code: 401,
      api_error: {
        error: {
          type: "invalid_api_key_error",
          message: "The API key provided is invalid or disabled.",
        },
      },
    });
  }

  const authUser = await User.findOne({
    where: {
      id: key.userId,
    },
  });

  if (!authUser) {
    return new Err({
      status_code: 500,
      api_error: {
        error: {
          type: "internal_server_error",
          message: "The user associaed with the api key was not found.",
        },
      },
    });
  }

  return new Ok(new Authenticator(authUser, null));
}
