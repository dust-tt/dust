import { getUserWithWorkspaces } from "@app/lib/api/user";
import { getUserFromWorkOSToken, verifyWorkOSToken } from "@app/lib/api/workos";
import {
  isWorkspaceConversationKillSwitched,
  isWorkspaceKillSwitchedForAllAPIs,
} from "@app/lib/api/workspace";
import {
  Authenticator,
  getAPIKey,
  getApiKeyNameFromHeaders,
  getBearerToken,
  getSession,
  isOAuthToken,
} from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import type {
  APIErrorWithStatusCode,
  WithAPIErrorResponse,
} from "@app/types/error";
import { getGroupIdsFromHeaders, getRoleFromHeaders } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { getUserEmailFromHeaders } from "@app/types/user";
import { TokenExpiredError } from "jsonwebtoken";
import type { NextApiRequest, NextApiResponse } from "next";

function getMaintenanceError(
  maintenance: string | number | true | object
): APIErrorWithStatusCode {
  // During relocation, we return 503, but once relocation is done, we return 404 since
  // at that point, the workspace should be treated as if it did not exist in this region anymore.
  // And that matches what will happen it gets purged later.
  // This also avoids getting constant alerts if the user is still sending requests to the old endpoint.
  if (maintenance === "relocation-done") {
    return {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: `The workspace was not found. [${maintenance}]`,
      },
    };
  }

  return {
    status_code: 503,
    api_error: {
      type: "service_unavailable",
      message: `Service is currently unavailable. [${maintenance}]`,
    },
  };
}

function getWorkspaceKillSwitchError(): APIErrorWithStatusCode {
  return {
    status_code: 503,
    api_error: {
      type: "service_unavailable",
      message:
        "Access to this workspace has been disabled for emergency maintenance.",
    },
  };
}

function getConversationKillSwitchError(): APIErrorWithStatusCode {
  return {
    status_code: 503,
    api_error: {
      type: "service_unavailable",
      message:
        "Access to this conversation has been disabled for emergency maintenance.",
    },
  };
}

const ASSISTANT_CONVERSATION_ROUTE_FRAGMENT = "/assistant/conversations/";

function getAssistantConversationIdFromRequest(
  req: NextApiRequest
): string | null {
  if (!req.url?.includes(ASSISTANT_CONVERSATION_ROUTE_FRAGMENT)) {
    return null;
  }

  return isString(req.query.cId) ? req.query.cId : null;
}

function getConversationKillSwitchErrorForRequest(
  req: NextApiRequest,
  killSwitched: unknown
): APIErrorWithStatusCode | null {
  const conversationId = getAssistantConversationIdFromRequest(req);
  if (!conversationId) {
    return null;
  }

  return isWorkspaceConversationKillSwitched(killSwitched, conversationId)
    ? getConversationKillSwitchError()
    : null;
}

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
 * This function now supports both cookie-based sessions and bearer token authentication.
 * If a session cookie is present, it will be used. Otherwise, it will attempt to authenticate
 * using a bearer token from the Authorization header.
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
    session: SessionWithUser | null
  ) => Promise<void> | void,
  opts: {
    isStreaming?: boolean;
    doesNotRequireCanUseProduct?: boolean;
    allowMissingWorkspace?: boolean;
  } = {}
) {
  return withLogging(
    async (
      req: NextApiRequestWithContext,
      res: NextApiResponse<WithAPIErrorResponse<T>>
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

      // Try to get session from cookies first
      const session = await getSession(req, res);
      let auth: Authenticator;

      if (session) {
        // Use session-based authentication
        auth = await Authenticator.fromSession(session, wId);
      } else {
        // Try bearer token authentication as fallback
        const bearerTokenRes = await getBearerToken(req);
        if (bearerTokenRes.isErr()) {
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "not_authenticated",
              message:
                "The user does not have an active session or is not authenticated.",
            },
          });
        }

        const token = bearerTokenRes.value;
        if (!isOAuthToken(token)) {
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
          const authRes = await handleWorkOSAuth(req, res, token, wId);
          if (authRes.isErr()) {
            return apiError(req, res, authRes.error);
          }
          auth = authRes.value;
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

      const owner = auth.workspace();
      const plan = auth.plan();

      if (opts.allowMissingWorkspace && (!owner || !plan)) {
        return handler(req, res, auth, session);
      }

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
        return apiError(req, res, getMaintenanceError(maintenance));
      }
      if (isWorkspaceKillSwitchedForAllAPIs(owner.metadata?.killSwitched)) {
        return apiError(req, res, getWorkspaceKillSwitchError());
      }
      const conversationKillSwitchError =
        getConversationKillSwitchErrorForRequest(
          req,
          owner.metadata?.killSwitched
        );
      if (conversationKillSwitchError) {
        return apiError(req, res, conversationKillSwitchError);
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

      if (!auth.isUser()) {
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
    opts.isStreaming
  );
}

/**
 * This function is a wrapper for Public API routes that require authentication for a workspace.
 * It must be used on all routes that require workspace authentication (prefix: /v1/w/[wId]/).
 *
 * @param handler
 * @param opts
 * @returns
 */
export function withPublicAPIAuthentication<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    // Null is passed for compatibility with withResourceFetchingFromRoute which uses
    // the 4th parameter to determine legacy endpoint support (null = API route).
    _sessionOrKeyAuth: null
  ) => Promise<void> | void,
  opts: {
    isStreaming?: boolean;
    /**
     * When true, system keys bypass the isBuilder() check even if their role is downgraded
     * via X-Dust-Role header. The key must still belong to the target workspace.
     * Used for internal calls (e.g., run_dust_app) where the role header is passed for
     * tracking purposes but the system key itself should still be trusted.
     */
    allowSystemKeyBypassBuilderCheck?: boolean;
  } = {}
) {
  const { isStreaming, allowSystemKeyBypassBuilderCheck } = opts;

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

      // Authentification with a token.
      // Straightforward since the token is attached to the user.
      if (isOAuthToken(token)) {
        try {
          const authRes = await handleWorkOSAuth(req, res, token, wId);
          if (authRes.isErr()) {
            // If WorkOS errors return an ApiError.
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
            return apiError(req, res, getMaintenanceError(maintenance));
          }
          if (
            isWorkspaceKillSwitchedForAllAPIs(
              auth.workspace()?.metadata?.killSwitched
            )
          ) {
            return apiError(req, res, getWorkspaceKillSwitchError());
          }
          const conversationKillSwitchError =
            getConversationKillSwitchErrorForRequest(
              req,
              auth.workspace()?.metadata?.killSwitched
            );
          if (conversationKillSwitchError) {
            return apiError(req, res, conversationKillSwitchError);
          }

          return await handler(req, res, auth, null);
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
        return apiError(req, res, getMaintenanceError(maintenance));
      }
      if (isWorkspaceKillSwitchedForAllAPIs(owner.metadata?.killSwitched)) {
        return apiError(req, res, getWorkspaceKillSwitchError());
      }
      const conversationKillSwitchError =
        getConversationKillSwitchErrorForRequest(
          req,
          owner.metadata?.killSwitched
        );
      if (conversationKillSwitchError) {
        return apiError(req, res, conversationKillSwitchError);
      }

      // Authenticator created from a key has the builder role if the key is associated with
      // the workspace. System keys can bypass this when allowSystemKeyBypassBuilderCheck is set.
      const isSystemKeyAllowed =
        allowSystemKeyBypassBuilderCheck &&
        workspaceAuth.isSystemKey() &&
        keyRes.value.workspaceId === owner.id;
      if (!workspaceAuth.isBuilder() && !isSystemKeyAllowed) {
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
      if (userEmailFromHeader) {
        workspaceAuth =
          (await workspaceAuth.exchangeSystemKeyForUserAuthByEmail(
            workspaceAuth,
            {
              userEmail: userEmailFromHeader,
            }
          )) ?? workspaceAuth;
      }

      // If we have a system key, we can override the key name from http headers.
      // This is only used for run_agent API call, to keep the original key name and get proper analytics.
      const apiKeyNameFromHeader = getApiKeyNameFromHeaders(req.headers);
      const key = workspaceAuth.key();
      if (apiKeyNameFromHeader && key && key.isSystem) {
        workspaceAuth = workspaceAuth.exchangeKey({
          id: key.id,
          name: apiKeyNameFromHeader,
          isSystem: key.isSystem,
          role: key.role,
          monthlyCapMicroUsd: key.monthlyCapMicroUsd,
        });
      }
      return handler(req, res, workspaceAuth, null);
    },
    isStreaming
  );
}

/**
 * This function is a wrapper for Public API routes that require authentication without a workspace.
 * It automatically detects whether to use WorkOS authentication based on the token's issuer.
 */
export function withTokenAuthentication<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    user: UserTypeWithWorkspaces
  ) => Promise<void> | void
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

      if (!isOAuthToken(bearerToken)) {
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
          // We were not able to decode the token for Workos,
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
 * Creates an authenticator for shared/publicly accessible endpoints.
 *
 * Use this for endpoints that can be accessed by anyone with the link:
 * - Frames
 *
 * Still maintains proper authentication via cookies but designed for endpoints
 * that don't require users to be logged into the main application.
 *
 * @returns Authenticated workspace-scoped authenticator for shared content, or null if not authenticated
 */
export async function getAuthForSharedEndpointWorkspaceMembersOnly(
  req: NextApiRequest,
  res: NextApiResponse,
  workspaceId: string
): Promise<Authenticator | null> {
  const session = await getSession(req, res);
  if (!session) {
    return null;
  }

  const auth = await Authenticator.fromSession(session, workspaceId);

  // If the user is not part of the workspace, return null.
  if (!auth.isUser()) {
    return null;
  }

  return auth;
}
