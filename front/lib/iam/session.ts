import type { RoleType, UserTypeWithWorkspaces } from "@dust-tt/types";
import type {
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  PreviewData,
} from "next";
import type { ParsedUrlQuery } from "querystring";
import { Op } from "sequelize";

import { getSession } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { isValidSession } from "@app/lib/iam/provider";
import {
  fetchUserFromSession,
  maybeUpdateFromExternalUser,
} from "@app/lib/iam/users";
import { Membership, Workspace } from "@app/lib/models";
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

interface MakeGetServerSidePropsRequirementsWrapperOptions<
  R extends boolean = true
> {
  enableLogging?: boolean;
  requireAuth: R;
}

export type CustomGetServerSideProps<
  Props extends { [key: string]: any } = { [key: string]: any },
  Params extends ParsedUrlQuery = ParsedUrlQuery,
  Preview extends PreviewData = PreviewData,
  RequireAuth extends boolean = true
> = (
  context: GetServerSidePropsContext<Params, Preview>,
  session: RequireAuth extends true ? SessionWithUser : null
) => Promise<GetServerSidePropsResult<Props>>;

export function makeGetServerSidePropsRequirementsWrapper<
  RequireAuth extends boolean = true
>({
  enableLogging = true,
  requireAuth,
}: MakeGetServerSidePropsRequirementsWrapperOptions<RequireAuth>) {
  return <T extends { [key: string]: any } = { [key: string]: any }>(
    getServerSideProps: CustomGetServerSideProps<T, any, any, RequireAuth>
  ) => {
    return async (
      context: GetServerSidePropsContext<ParsedUrlQuery, PreviewData>
    ) => {
      const session = requireAuth
        ? await getSession(context.req, context.res)
        : null;
      if (requireAuth && (!session || !isValidSession(session))) {
        return {
          redirect: {
            permanent: false,
            // TODO(2024-03-04 flav) Add support for `returnTo=`.
            destination: "/api/auth/login",
          },
        };
      }

      const userSession = session as RequireAuth extends true
        ? SessionWithUser
        : null;

      if (enableLogging) {
        return withGetServerSidePropsLogging(getServerSideProps)(
          context,
          userSession
        );
      }

      return getServerSideProps(context, userSession);
    };
  };
}

export const withDefaultGetServerSidePropsRequirements =
  makeGetServerSidePropsRequirementsWrapper({ requireAuth: true });
