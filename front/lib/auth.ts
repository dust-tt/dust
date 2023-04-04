import { App, User, DataSource } from "./models";
import { InternalErrorWithStatusCode } from "./error";
import { Result, Ok, Err } from "@app/lib/result";
import { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { getServerSession } from "next-auth/next";

type Role = "owner" | "read_only";

/**
 * This is a class that will be used to check if a user can perform an action on a resource.
 * It acts as a central place to enforce permissioning across all of Dust.
 * In the future once we have Workspace the logic of resolving membership of a workspace and
 * associated permission will be implemented here.
 */
export class Authenticator {
  authUser: User | null;

  constructor(authUser: User | null) {
    this.authUser = authUser;
  }

  user(): User | null {
    return this.authUser;
  }

  /**
   * There is no workspace yet but eventually we'll have a workspace model and this will be used to
   * check if the user is a member of the workspace.
   */
  async roleFor(resourceOwner: User): Promise<Role> {
    if (resourceOwner.id === this.authUser?.id) {
      return "owner";
    } else {
      return "read_only";
    }
  }

  /**
   * Any user can run a `public` or `unlisted` app. Only the owner can read a `private` app.
   */
  canReadApp(app: App): boolean {
    switch (app.visibility) {
      case "private":
        return this.authUser?.id === app.userId;
      case "public":
      case "unlisted":
        return true;
      default:
        return false;
    }
  }

  /**
   * Only the owner can edit an app.
   */
  canEditApp(app: App): boolean {
    return this.authUser?.id === app.userId;
  }

  /**
   * Only the owner of an app can run it. This is an artificial restriction due to the fact that we
   * don't have `front` side `Run` objects. If we allowed anyone to run an app, the "Logs" panel of
   * a user would see `Runs` from other user which is not desirable.
   *
   * Once we introduce a `front` side `Run` object, we can remove this restriction and allow anyone
   * to run a public app with their own credentials. This will enable use to have the "Use" and
   * "Logs" panels available to any logged-in user.
   */
  canRunApp(app: App): boolean {
    return this.authUser?.id === app.userId;
  }

  /**
   * Any user can read a `public` data source. Only the owner can read a `private` data source.
   */
  canReadDataSource(dataSource: DataSource): boolean {
    switch (dataSource.visibility) {
      case "public":
        return true;
      case "private":
        return this.authUser?.id === dataSource.userId;
      default:
        return false;
    }
  }

  /**
   * Only the owner can edit a data source.
   */
  canEditDataSource(dataSource: DataSource): boolean {
    return this.authUser?.id === dataSource.userId;
  }
}

/**
 * Get a an Authenticator assiciated with the authentified user from the nextauth session.
 * @param req NextApiRequest request object
 * @param res NextApiResponse response object
 * @returns Result<Authenticator, InternalErrorWithStatusCode>
 */
export async function auth_user(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Result<Authenticator, InternalErrorWithStatusCode>> {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return Ok(new Authenticator(null));
  }

  let authUser = await User.findOne({
    where: {
      githubId: session.provider.id.toString(),
    },
  });

  if (!authUser) {
    return Err({
      status_code: 404,
    });
  }

  return Ok(new Authenticator(authUser));
}
