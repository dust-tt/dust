import { App, User, DataSource } from "./models";
import { InternalErrorWithStatusCode } from "./error";
import { Result, Ok, Err } from "@app/lib/result";
import { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { getServerSession } from "next-auth/next";

type Role = "owner" | "read_only";

export class Authenticator {
  authUser: User;

  constructor(authUser: User) {
    this.authUser = authUser;
  }

  user() {
    return this.authUser;
  }

  // There is no workspace yet but eventually we'll have a workspace model and this will be used to
  // check if the user is a member of the workspace.
  async roleFor(resourceOwner: User): Promise<Role> {
    if (resourceOwner.id === this.authUser.id) {
      return "owner";
    } else {
      return "read_only";
    }
  }

  canReadApp(app: App): boolean {
    switch (app.visibility) {
      case "private":
        return this.authUser.id === app.userId;
      case "public":
      case "unlisted":
        return true;
      default:
        return false;
    }
  }

  canEditApp(app: App): boolean {
    return this.authUser.id === app.userId;
  }

  canRunApp(app: App): boolean {
    return this.authUser.id === app.userId;
  }

  canReadDataSource(dataSource: DataSource): boolean {
    switch (dataSource.visibility) {
      case "public":
        return true;
      case "private":
        return this.authUser.id === dataSource.userId;
      default:
        return false;
    }
  }

  canEditDataSource(dataSource: DataSource): boolean {
    return this.authUser.id === dataSource.userId;
  }
}

export async function auth_user(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Result<Authenticator, InternalErrorWithStatusCode>> {
  const session = await getServerSession(req, res, authOptions);

  let authUser = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!authUser) {
    return Err({
      status_code: 404,
    });
  }

  return Ok(new Authenticator(authUser));
}
