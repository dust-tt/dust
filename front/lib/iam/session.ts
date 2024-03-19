import type { RoleType, UserTypeWithWorkspaces } from "@dust-tt/types";
import { isEnterpriseConnectionSub } from "@dust-tt/types";
import type {
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  PreviewData,
} from "next";
import type { ParsedUrlQuery } from "querystring";
import { Op } from "sequelize";

import { Authenticator, getSession } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { isValidSession } from "@app/lib/iam/provider";
import {
  fetchUserFromSession,
  maybeUpdateFromExternalUser,
} from "@app/lib/iam/users";
import { Membership, Workspace } from "@app/lib/models";
import logger from "@app/logger/logger";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

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

  await maybeUpdateFromExternalUser(user, session.user);

  return {
    id: user.id,
    createdAt: user.createdAt.getTime(),
    provider: user.provider,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.firstName + (user.lastName ? ` ${user.lastName}` : ""),
    image: user.imageUrl,
    workspaces: workspaces.map((w) => {
      const m = memberships.find((m) => m.workspaceId === w.id);
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
        sId: w.sId,
        name: w.name,
        role,
        segmentation: w.segmentation || null,
      };
    }),
  };
}

export type UserPrivilege = "none" | "user" | "superuser";

interface MakeGetServerSidePropsRequirementsWrapperOptions<
  R extends UserPrivilege = "user"
> {
  enableLogging?: boolean;
  requireUserPrivilege: R;
  requireCanUseProduct?: boolean;
}

export type CustomGetServerSideProps<
  Props extends { [key: string]: any } = { [key: string]: any },
  Params extends ParsedUrlQuery = ParsedUrlQuery,
  Preview extends PreviewData = PreviewData,
  RequireUserPrivilege extends UserPrivilege = "user"
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
    return isEnterpriseConnectionSub(session.user.sub);
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

export function makeGetServerSidePropsRequirementsWrapper<
  RequireUserPrivilege extends UserPrivilege = "user"
>({
  enableLogging = true,
  requireUserPrivilege,
  requireCanUseProduct = false,
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

        // Validate the user's session to guarantee compliance with the workspace's SSO requirements when SSO is enforced.
        if (auth && !statisfiesEnforceEntrepriseConnection(auth, session)) {
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
  });

export const withDefaultUserAuthRequirements =
  makeGetServerSidePropsRequirementsWrapper({
    requireUserPrivilege: "user",
    requireCanUseProduct: true,
  });

export const withSuperUserAuthRequirements =
  makeGetServerSidePropsRequirementsWrapper({
    requireUserPrivilege: "superuser",
    requireCanUseProduct: false,
  });
