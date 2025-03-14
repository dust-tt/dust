import type {
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  PreviewData,
} from "next";
import type { ParsedUrlQuery } from "querystring";

import { getUserWithWorkspaces } from "@app/lib/api/user";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator, getSession } from "@app/lib/auth";
import { isEnterpriseConnection } from "@app/lib/iam/enterprise";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { isValidSession } from "@app/lib/iam/provider";
import {
  fetchUserFromSession,
  maybeUpdateFromExternalUser,
} from "@app/lib/iam/users";
import logger from "@app/logger/logger";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";
import type { UserTypeWithWorkspaces } from "@app/types";
import { isString } from "@app/types";

/**
 * Retrieves the user for a given session
 * @param session any Auth0 session
 * @returns Promise<UserType | null>
 */
export async function getUserFromSession(
  session: SessionWithUser | null
): Promise<UserTypeWithWorkspaces | null> {
  if (!session || !isValidSession(session)) {
    return null;
  }

  const user = await fetchUserFromSession(session);
  if (!user) {
    return null;
  }

  await maybeUpdateFromExternalUser(user, session.user);

  return getUserWithWorkspaces(user);
}

export type UserPrivilege = "none" | "user" | "superuser";

interface MakeGetServerSidePropsRequirementsWrapperOptions<
  R extends UserPrivilege = "user",
> {
  enableLogging?: boolean;
  requireUserPrivilege: R;
  requireCanUseProduct?: boolean;
  allowUserOutsideCurrentWorkspace?: boolean;
}

export type CustomGetServerSideProps<
  Props extends { [key: string]: any } = { [key: string]: any },
  Params extends ParsedUrlQuery = ParsedUrlQuery,
  Preview extends PreviewData = PreviewData,
  RequireUserPrivilege extends UserPrivilege = "user",
> = (
  context: GetServerSidePropsContext<Params, Preview>,
  auth: RequireUserPrivilege extends "none" ? null : Authenticator,
  session: RequireUserPrivilege extends "none" ? null : SessionWithUser
) => Promise<GetServerSidePropsResult<Props>>;

export function statisfiesEnforceEntrepriseConnection(
  auth: Authenticator,
  session: SessionWithUser
) {
  const owner = auth.workspace();
  if (!owner) {
    return true;
  }

  if (owner.ssoEnforced) {
    return isEnterpriseConnection(session.user);
  }

  return true;
}

async function getAuthenticator(
  context: GetServerSidePropsContext<ParsedUrlQuery, PreviewData>,
  session: SessionWithUser | null,
  requireUserPrivilege: UserPrivilege
) {
  if (!session) {
    return null;
  }

  const { wId } = context.params ?? {};
  const workspaceId = typeof wId === "string" ? wId : null;

  switch (requireUserPrivilege) {
    case "user":
      return workspaceId
        ? Authenticator.fromSession(session, workspaceId)
        : null;

    case "superuser":
      return Authenticator.fromSuperUserSession(session, workspaceId);

    default:
      return null;
  }
}

async function getWorkspace(
  context: GetServerSidePropsContext<ParsedUrlQuery, PreviewData>
) {
  const { wId } = context.params ?? {};
  return isString(wId) ? getWorkspaceInfos(wId) : null;
}

export function makeGetServerSidePropsRequirementsWrapper<
  RequireUserPrivilege extends UserPrivilege = "user",
>({
  enableLogging = true,
  requireUserPrivilege,
  requireCanUseProduct = false,
  allowUserOutsideCurrentWorkspace,
}: MakeGetServerSidePropsRequirementsWrapperOptions<RequireUserPrivilege>) {
  return <T extends { [key: string]: any } = { [key: string]: any }>(
    getServerSideProps: CustomGetServerSideProps<
      T,
      any,
      any,
      RequireUserPrivilege
    >
  ) => {
    return async (
      context: GetServerSidePropsContext<ParsedUrlQuery, PreviewData>
    ) => {
      const session =
        requireUserPrivilege !== "none"
          ? await getSession(context.req, context.res)
          : null;
      const auth = await getAuthenticator(
        context,
        session,
        requireUserPrivilege
      );

      const workspace = auth ? auth.workspace() : await getWorkspace(context);
      const maintenance = workspace?.metadata?.maintenance;

      if (maintenance) {
        return {
          redirect: {
            permanent: false,
            destination: `/maintenance?workspace=${workspace.sId}&code=${maintenance}`,
          },
        };
      }

      if (
        requireCanUseProduct &&
        !auth?.subscription()?.plan.limits.canUseProduct
      ) {
        if (typeof context.query.wId !== "string") {
          // this should never happen.
          logger.error(
            { panic: true, path: context.resolvedUrl },
            "canUseProduct should never be true outside of a workspace context."
          );
          throw new Error(
            "canUseProduct should never be true outside of a workspace context."
          );
        }
        return {
          redirect: {
            permanent: false,
            destination: `/w/${context.query.wId}/subscribe`,
          },
        };
      }

      if (requireUserPrivilege !== "none") {
        if (!session || !isValidSession(session)) {
          return {
            redirect: {
              permanent: false,
              // TODO(2024-03-04 flav) Add support for `returnTo=`.
              destination: "/api/auth/login",
            },
          };
        }

        const isDustSuperUser = auth?.isDustSuperUser() ?? false;
        if (requireUserPrivilege === "superuser" && !isDustSuperUser) {
          return {
            notFound: true,
          };
        }

        // If we target a workspace and the user is not in the workspace, return not found.
        if (!allowUserOutsideCurrentWorkspace && workspace && !auth?.isUser()) {
          return {
            notFound: true,
          };
        }

        // Validate the user's session to guarantee compliance with the workspace's SSO requirements when SSO is enforced.
        if (
          auth &&
          !statisfiesEnforceEntrepriseConnection(auth, session) &&
          requireUserPrivilege !== "superuser"
        ) {
          return {
            redirect: {
              permanent: false,
              // TODO(2024-03-04 flav) Add support for `returnTo=`.
              destination: `/sso-enforced?workspaceId=${auth.workspace()?.sId}`,
            },
          };
        }
      }

      const userSession = session as RequireUserPrivilege extends "none"
        ? null
        : SessionWithUser;
      const userAuth = auth as RequireUserPrivilege extends "none"
        ? null
        : Authenticator;

      if (enableLogging) {
        return withGetServerSidePropsLogging(getServerSideProps)(
          context,
          userAuth,
          userSession
        );
      }

      return getServerSideProps(context, userAuth, userSession);
    };
  };
}

export const withDefaultUserAuthPaywallWhitelisted =
  makeGetServerSidePropsRequirementsWrapper({
    requireUserPrivilege: "user",
    requireCanUseProduct: false,
    allowUserOutsideCurrentWorkspace: false,
  });

export const withDefaultUserAuthRequirements =
  makeGetServerSidePropsRequirementsWrapper({
    requireUserPrivilege: "user",
    requireCanUseProduct: true,
    allowUserOutsideCurrentWorkspace: false,
  });

/**
 * This should only be used for pages that don't require
 * the current user to be in the current workspace.
 */
export const withDefaultUserAuthRequirementsNoWorkspaceCheck =
  makeGetServerSidePropsRequirementsWrapper({
    requireUserPrivilege: "user",
    requireCanUseProduct: true,
    // This is a special case where we don't want to check
    // if the user is in the current workspace.
    allowUserOutsideCurrentWorkspace: true,
  });

export const withSuperUserAuthRequirements =
  makeGetServerSidePropsRequirementsWrapper({
    requireUserPrivilege: "superuser",
    requireCanUseProduct: false,
    allowUserOutsideCurrentWorkspace: false,
  });
