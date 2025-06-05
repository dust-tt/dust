import type { TokenExpiredError } from "jsonwebtoken";
import type { NextApiRequest, NextApiResponse } from "next";

import type { MethodType, ScopeType } from "@app/lib/api/auth0";
import {
  getRequiredScope,
  getUserFromAuth0Token,
  verifyAuth0Token,
} from "@app/lib/api/auth0";
import { getUserWithWorkspaces } from "@app/lib/api/user";
import {
  Authenticator,
  getAPIKey,
  getAuthType,
  getBearerToken,
} from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import type {
  RoleType,
  UserTypeWithWorkspaces,
  WithAPIErrorResponse,
} from "@app/types";
import { getGroupIdsFromHeaders, getUserEmailFromHeaders } from "@app/types";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
      req.addResourceToLog?.(auth.getNonNullableUser());

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

      // Authentification with Auth0 token.
      // Straightforward since the token is attached to the user.
      if (authMethod === "access_token") {
        try {
          // Decode the JWT token to check the issuer
          const decodedPayload = JSON.parse(
            Buffer.from(token.split(".")[1], "base64").toString()
          );

          // For WorkOS, the issuer is "https://auth-api.dust.tt"
          // For Auth0, the issuer is "https://dust-dev.eu.auth0.com/"
          const platform = extractPlatformFromTokenIssuer(decodedPayload.iss);

          let authRes = null;
          if (platform === "workos") {
            const workOSUserId = decodedPayload.sub;
            if (!workOSUserId) {
              return apiError(req, res, {
                status_code: 401,
                api_error: {
                  type: "not_authenticated",
                  message:
                    "The request does not have valid authentication credentials.",
                },
              });
            }

            authRes = await handleWorkOSAuth(req, res, workOSUserId, wId);
          } else if (platform === "auth0") {
            authRes = await handleAuth0Auth(req, res, token, wId, opts);
          } else {
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "not_authenticated",
                message:
                  "The request does not have valid authentication credentials.",
              },
            });
          }

          if (authRes.isErr()) {
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

          req.addResourceToLog?.(auth.getNonNullableUser());

          const maintenance = auth.workspace()?.metadata?.maintenance;
          if (maintenance) {
            return apiError(req, res, {
              status_code: 503,
              api_error: {
                type: "not_authenticated",
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
        getGroupIdsFromHeaders(req.headers)
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

      const apiKey = keyAuth.key();

      logger.info(
        {
          method: req.method,
          url: req.url,
          key: apiKey ? { id: apiKey.id, name: apiKey.name } : null,
        },
        "withPublicAPIAuthentication request"
      );

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
        // Decode the JWT token to check the issuer
        const decodedPayload = JSON.parse(
          Buffer.from(bearerToken.split(".")[1], "base64").toString()
        );

        const platform = extractPlatformFromTokenIssuer(decodedPayload.iss);
        if (!platform) {
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "not_authenticated",
              message:
                "The request does not have valid authentication credentials.",
            },
          });
        }

        let user: UserResource | null = null;
        if (platform === "workos") {
          // Extract WorkOS user ID from the sub claim
          const workOSUserId = decodedPayload.sub;
          if (!workOSUserId) {
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "not_authenticated",
                message:
                  "The request does not have valid authentication credentials.",
              },
            });
          }

          user = await UserResource.fetchByWorkOSUserId(workOSUserId);
        } else {
          // Handle Auth0 token
          const decoded = await verifyAuth0Token(
            bearerToken,
            getRequiredScope(req, opts.requiredScopes)
          );
          if (decoded.isErr()) {
            const error = decoded.error;
            if ((error as TokenExpiredError).expiredAt) {
              return apiError(req, res, {
                status_code: 401,
                api_error: {
                  type: "expired_oauth_token_error",
                  message: "The access token expired.",
                },
              });
            }

            logger.error(decoded.error, "Failed to verify Auth0 token");
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "invalid_oauth_token_error",
                message:
                  "The request does not have valid authentication credentials.",
              },
            });
          }

          user = await getUserFromAuth0Token(decoded.value);
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
 * For WorkOS, the issuer is "https://auth-api.dust.tt"
 * For Auth0, the issuer is "https://dust-dev.eu.auth0.com/"
 */
function extractPlatformFromTokenIssuer(
  issuer: string
): "auth0" | "workos" | null {
  if (issuer === "https://dust-dev.eu.auth0.com/") {
    return "auth0";
  } else if (issuer === "https://auth-api.dust.tt") {
    return "workos";
  }
  return null;
}

/**
 * Helper function to handle WorkOS authentication
 */
async function handleWorkOSAuth<T>(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  workOSUserId: string,
  wId: string
): Promise<Result<Authenticator, APIErrorWithStatusCode>> {
  const userResource = await UserResource.fetchByWorkOSUserId(workOSUserId);
  if (!userResource) {
    return new Err({
      status_code: 401,
      api_error: {
        type: "user_not_found",
        message: "The user is not registered.",
      },
    });
  }

  const workspace = await Workspace.findOne({
    where: {
      sId: wId,
    },
  });
  if (!workspace) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  let role = "none" as RoleType;
  let groups: GroupResource[] = [];
  let subscription: SubscriptionResource | null = null;

  [role, groups, subscription] = await Promise.all([
    MembershipResource.getActiveRoleForUserInWorkspace({
      user: userResource,
      workspace: renderLightWorkspaceType({ workspace }),
    }),
    GroupResource.listUserGroupsInWorkspace({
      user: userResource,
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
      user: userResource,
      role,
      subscription,
    })
  );
}

/**
 * Helper function to handle Auth0 authentication
 */
async function handleAuth0Auth<T>(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<T>>,
  token: string,
  wId: string,
  opts: {
    requiredScopes?: Partial<Record<MethodType, ScopeType>>;
  }
): Promise<Result<Authenticator, APIErrorWithStatusCode>> {
  const decoded = await verifyAuth0Token(
    token,
    getRequiredScope(req, opts.requiredScopes)
  );
  if (decoded.isErr()) {
    const error = decoded.error;
    if ((error as TokenExpiredError).expiredAt) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "expired_oauth_token_error",
          message: "The access token expired.",
        },
      });
    }

    logger.error(decoded.error, "Failed to verify Auth0 token");
    return new Err({
      status_code: 401,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "The request does not have valid authentication credentials.",
      },
    });
  }

  const authRes = await Authenticator.fromAuth0Token({
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
