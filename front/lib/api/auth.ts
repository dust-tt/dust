import { NextApiRequest } from "next";
import { Result, Ok, Err } from "@app/lib/result";
import { APIErrorWithStatusCode } from "@app/lib/api/error";
import { Key, User } from "@app/lib/models";
import { Authenticator } from "@app/lib/auth";

/**
 * Get a user id from the Authorization Bearer header
 * @param req NextApiRequest request object
 * @returns Result<number, HTTPError> Ok(User) or Err(HTTPError)
 */
export async function auth_api_user(
  req: NextApiRequest
): Promise<Result<Authenticator, APIErrorWithStatusCode>> {
  if (!req.headers.authorization) {
    return Err({
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
    return Err({
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
    return Err({
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
    return Err({
      status_code: 500,
      api_error: {
        error: {
          type: "internal_server_error",
          message: "The user associaed with the api key was not found.",
        },
      },
    });
  }

  return Ok(new Authenticator(authUser));
}
