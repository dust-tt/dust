import { TokenExpiredError } from "jsonwebtoken";
import type { NextApiRequest, NextApiResponse } from "next";

import { getUserWithWorkspaces } from "@app/lib/api/user";
import { getUserFromWorkOSToken, verifyWorkOSToken } from "@app/lib/api/workos";
import {
  Authenticator,
  getAPIKey,
  getAuthType,
  getBearerToken,
  getSession,
} from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { UserTypeWithWorkspaces, WithAPIErrorResponse } from "@app/types";
import {
  getGroupIdsFromHeaders,
  getRoleFromHeaders,
  getUserEmailFromHeaders,
} from "@app/types";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const SUPPORTED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export type MethodType = (typeof SUPPORTED_METHODS)[number];

export type ScopeType =
  | "read:user_profile"
  | "read:conversation"
  | "update:conversation"
  | "create:conversation"
  | "read:file"
  | "update:file"
  | "create:file"
  | "delete:file"
  | "read:agent";

/**
 * This function is a wrapper for API routes that require session authentication.
 *
 * @param handler
 * @param param1
 * @returns
 */
export function withSessionAuthentication<T>(
  handler: (
    req: NextApiRequestWithContext,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    session: SessionWithUser
  ) => Promise<void> | void,
  { isStreaming = false }: { isStreaming?: boolean } = {}
) {
  return withLogging(
    async (
      req: NextApiRequestWithContext,
      res: NextApiResponse<WithAPIErrorResponse<T>>,
      { session }
    ) => {
      if (!session) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message:
              "The user does not have an active session or is not authenticated.",
          },
        });
      }

      return handler(req, res, session);
    },
    isStreaming
  );
}

export function withSessionAuthenticationForPoke<T>(
  handler: (
    req: NextApiRequestWithContext,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    session: SessionWithUser
  ) => Promise<void> | void,
  { isStreaming = false }: { isStreaming?: boolean } = {}
) {
  return withSessionAuthentication(
    async (req, res, session) => {
      const auth = await Authenticator.fromSuperUserSession(session, null);

      if (!auth.isDustSuperUser()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message: "The user does not have permission",
          },
        });
      }

      return handler(req, res, session);
    },
    { isStreaming }
  );
}

/**
 * This function is a wrapper for API routes that require session authentication for a workspace.
 * It must be used on all routes that require workspace authentication (prefix: /w/[wId]/).
 *
 * opts.allowUserOutsideCurrentWorkspace allows the handler to be called even if the user is not a
 * member of the workspace. This is useful for routes that share data across workspaces (eg apps
 * runs).
 *
 * @param handler
 * @param opts
 * @returns
 */
export function withSessionAuthenticationForWorkspace<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    session: SessionWithUser
  ) => Promise<void> | void,
  opts: {
    isStreaming?: boolean;
    allowUserOutsideCurrentWorkspace?: boolean;
    doesNotRequireCanUseProduct?: boolean;
  } = {}
) {
  return withSessionAuthentication(
    async (
      req: NextApiRequestWithContext,
      res: NextApiResponse<WithAPIErrorResponse<T>>,
      session: SessionWithUser
    ) => {
      const { wId } = req.query;
      if (typeof wId !== "string" || !wId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace was not found.",
          },
        });
      }

      const auth = await Authenticator.fromSession(session, wId);

      const owner = auth.workspace();
      const plan = auth.plan();
      if (!owner || !plan) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace was not found.",
          },
        });
      }

      if (
        !opts.doesNotRequireCanUseProduct &&
        !auth?.subscription()?.plan.limits.canUseProduct
      ) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_can_use_product_required_error",
            message: "The workspace was not found.",
          },
        });
      }

      const maintenance = owner.metadata?.maintenance;
      if (maintenance) {
        return apiError(req, res, {
          status_code: 503,
          api_error: {
            type: "service_unavailable",
            message: `Service is currently unavailable. [${maintenance}]`,
          },
        });
      }

      const user = auth.user();
      if (!user) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_user_not_found",
            message: "Could not find the user of the current session.",
          },
        });
      }
      req.addResourceToLog?.(user);

      // If `allowUserOutsideCurrentWorkspace` is not set or false then we check that the user is a
      // member of the workspace.
      if (!auth.isUser() && !opts.allowUserOutsideCurrentWorkspace) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users of the workspace can access this route.",
          },
        });
      }

      return handler(req, res, auth, session);
    },
    opts
  );
}

/**
 * This function is a wrapper for Public API routes that require authentication for a workspace.
 * It must be used on all routes that require workspace authentication (prefix: /v1/w/[wId]/).
 *
 * opts.allowUserOutsideCurrentWorkspace allows the handler to be called even if the key is not a
 * associated with the workspace. This is useful for routes that share data across workspaces (eg apps
 * runs).
 *
 * @param handler
 * @param opts
 * @returns
 */
export function withPublicAPIAuthentication<T, U extends boolean>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    keyAuth: U extends true ? Authenticator : null
  ) => Promise<void> | void,
  opts: {
    isStreaming?: boolean;
    allowUserOutsideCurrentWorkspace?: U;
    requiredScopes?: Partial<Record<MethodType, ScopeType>>;
  } = {}
) {
  const { allowUserOutsideCurrentWorkspace, isStreaming } = opts;

  return withLogging(
    async (
      req: NextApiRequestWithContext,
      res: NextApiResponse<WithAPIErrorResponse<T>>
    ) => {
      const wId = typeof req.query.wId === "string" ? req.query.wId : undefined;
      if (!wId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace was not found.",
          },
        });
      }

      const bearerTokenRes = await getBearerToken(req);
      if (bearerTokenRes.isErr()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message:
              "The request does not have valid authentication credentials.",
          },
        });
      }
      const token = bearerTokenRes.value;
      const authMethod = getAuthType(token);

      // Authentification with  token.
      // Straightforward since the token is attached to the user.
      if (authMethod === "access_token") {
        try {
          const authRes = await handleWorkOSAuth(req, res, token, wId);
          if (authRes.isErr()) {
            // If WorkOS errors and Auth0 also fails, return an ApiError.
            return apiError(req, res, authRes.error);
          }

          const auth = authRes.value;

          if (auth.user() === null) {
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "user_not_found",
                message:
                  "The user does not have an active session or is not authenticated.",
              },
            });
          }
          if (!auth.isUser()) {
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message: "Only users of the workspace can access this route.",
              },
            });
          }

          const owner = auth.workspace();
          const plan = auth.plan();
          if (!owner || !plan) {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "workspace_not_found",
                message: "The workspace was not found.",
              },
            });
          }

          if (!plan.limits.canUseProduct) {
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_can_use_product_required_error",
                message:
                  "Your current plan does not allow API access. Please upgrade your plan.",
              },
            });
          }

          req.addResourceToLog?.(auth.getNonNullableUser());

          const maintenance = auth.workspace()?.metadata?.maintenance;
          if (maintenance) {
            return apiError(req, res, {
              status_code: 503,
              api_error: {
                type: "service_unavailable",
                message: `Service is currently unavailable. [${maintenance}]`,
              },
            });
          }

          return await handler(
            req,
            res,
            auth,
            null as U extends true ? Authenticator : null
          );
        } catch (error) {
          logger.error({ error }, "Failed to verify token");
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "invalid_oauth_token_error",
              message:
                "The request does not have valid authentication credentials.",
            },
          });
        }
      }

      // Authentification with an API key.
      const keyRes = await getAPIKey(req);
      if (keyRes.isErr()) {
        return apiError(req, res, keyRes.error);
      }

      const keyAndWorkspaceAuth = await Authenticator.fromKey(
        keyRes.value,
        wId,
        getGroupIdsFromHeaders(req.headers),
        getRoleFromHeaders(req.headers)
      );
      const { keyAuth } = keyAndWorkspaceAuth;
      let { workspaceAuth } = keyAndWorkspaceAuth;

      const owner = workspaceAuth.workspace();
      const plan = workspaceAuth.plan();
      if (!owner || !plan) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace was not found.",
          },
        });
      }

      if (!plan.limits.canUseProduct) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_can_use_product_required_error",
            message:
              "Your current plan does not allow API access. Please upgrade your plan.",
          },
        });
      }

      const maintenance = owner.metadata?.maintenance;
      if (maintenance) {
        return apiError(req, res, {
          status_code: 503,
          api_error: {
            type: "service_unavailable",
            message: `Service is currently unavailable. [${maintenance}]`,
          },
        });
      }

      // Authenticator created from the a key has the builder role if the key is associated with
      // the workspace.
      if (!workspaceAuth.isBuilder() && !allowUserOutsideCurrentWorkspace) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users of the workspace can access this route.",
          },
        });
      }

      // NOTE: This section is for internal use only!
      // If the "x-api-user-email" header is present and contains a valid email address, attempt
      // to exchange the current workspace authentication for user authentication.
      // This operation is only performed if:
      // 1. The user associated with the email is a member of the current workspace.
      // 2. The system key is being used for authentication.
      const userEmailFromHeader = getUserEmailFromHeaders(req.headers);
      if (userEmailFromHeader && !allowUserOutsideCurrentWorkspace) {
        workspaceAuth =
          (await workspaceAuth.exchangeSystemKeyForUserAuthByEmail(
            workspaceAuth,
            {
              userEmail: userEmailFromHeader,
            }
          )) ?? workspaceAuth;
      }

      return handler(
        req,
        res,
        workspaceAuth,
        (opts.allowUserOutsideCurrentWorkspace
          ? keyAuth
          : null) as U extends true ? Authenticator : null
      );
    },
    isStreaming
  );
}

/**
 * This function is a wrapper for Public API routes that require authentication without a workspace.
 * It automatically detects whether to use Auth0 or WorkOS authentication based on the token's issuer.
 */
export function withTokenAuthentication<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    user: UserTypeWithWorkspaces
  ) => Promise<void> | void,
  // TODO(workos): Handle required scopes.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  opts: {
    requiredScopes?: Partial<Record<MethodType, ScopeType>>;
  } = {}
) {
  return withLogging(
    async (
      req: NextApiRequestWithContext,
      res: NextApiResponse<WithAPIErrorResponse<T>>
    ) => {
      const bearerTokenRes = await getBearerToken(req);
      if (bearerTokenRes.isErr()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message:
              "The request does not have valid authentication credentials.",
          },
        });
      }
      const bearerToken = bearerTokenRes.value;
      const authMethod = getAuthType(bearerToken);

      if (authMethod !== "access_token") {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message:
              "The request does not have valid authentication credentials.",
          },
        });
      }

      try {
        let user: UserResource | null = null;

        // Try WorkOS token first
        const workOSDecoded = await verifyWorkOSToken(bearerToken);
        if (workOSDecoded.isOk()) {
          user = await getUserFromWorkOSToken(workOSDecoded.value);
        } else if (
          workOSDecoded.isErr() &&
          workOSDecoded.error instanceof TokenExpiredError
        ) {
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "expired_oauth_token_error",
              message: "The access token expired.",
            },
          });
        }

        if (workOSDecoded.isErr()) {
          // We were not able to decode the token for Workos, nor Auth0,
          // so we log the error and return an API error.
          logger.error(
            {
              workOSError: workOSDecoded.error,
            },
            "Failed to verify token with WorkOS"
          );
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "invalid_oauth_token_error",
              message:
                "The request does not have valid authentication credentials.",
            },
          });
        }

        if (!user) {
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "user_not_found",
              message: "The user is not registered.",
            },
          });
        }

        req.addResourceToLog?.(user);

        const isFromExtension = req.headers["x-request-origin"] === "extension";
        const userWithWorkspaces = await getUserWithWorkspaces(
          user,
          isFromExtension
        );

        const orgId = workOSDecoded.value.org_id;
        if (orgId) {
          const workspace = userWithWorkspaces.workspaces.find(
            (w) => w.workOSOrganizationId === orgId
          );
          userWithWorkspaces.selectedWorkspace = workspace?.sId;
        }

        return await handler(req, res, userWithWorkspaces);
      } catch (error) {
        logger.error({ error }, "Failed to verify token");
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_oauth_token_error",
            message:
              "The request does not have valid authentication credentials.",
          },
        });
      }
    }
  );
}

/**
 * Helper function to handle WorkOS authentication
 */
async function handleWorkOSAuth<T>(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  token: string,
  wId: string
): Promise<Result<Authenticator, APIErrorWithStatusCode>> {
  const decoded = await verifyWorkOSToken(token);
  if (decoded.isErr()) {
    const error = decoded.error;
    if (error instanceof TokenExpiredError) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "expired_oauth_token_error",
          message: "The access token expired.",
        },
      });
    }

    return new Err({
      status_code: 401,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "The request does not have valid authentication credentials.",
      },
    });
  }

  const authRes = await Authenticator.fromWorkOSToken({
    token: decoded.value,
    wId,
  });
  if (authRes.isErr()) {
    return new Err({
      status_code: 403,
      api_error: {
        type: authRes.error.code,
        message:
          "The user does not have an active session or is not authenticated.",
      },
    });
  }

  return new Ok(authRes.value);
}

/**
 * Checks if the current session has a user that is an active member of the specified workspace.
 * Returns true if the user is authenticated and is a member of the workspace.
 * Returns false if not authenticated or not a member.
 */
export async function isSessionWithUserFromWorkspace(
  req: NextApiRequest,
  res: NextApiResponse,
  workspaceId: string
): Promise<boolean> {
  const auth = await getAuthFromWorkspaceSession(req, res, workspaceId);

  if (!auth) {
    return false;
  }

  return auth.isUser();
}

/**
 * Get an auth object if the current session has a user that is an active member of the specified
 * workspace.
 * Return an Authenticator if the user is authenticated and is a member of the workspace.
 * Returns null if not authenticated or not a member.
 */
export async function getAuthFromWorkspaceSession(
  req: NextApiRequest,
  res: NextApiResponse,
  workspaceId: string
): Promise<Authenticator | null> {
  const session = await getSession(req, res);
  if (!session) {
    return null;
  }

  const auth = await Authenticator.fromSession(session, workspaceId);

  return auth;
}
