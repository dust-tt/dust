import type { RoleType, UserTypeWithWorkspaces } from "@dust-tt/types";
import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  PreviewData,
} from "next";
import type { ParsedUrlQuery } from "querystring";
import { Op } from "sequelize";

import { getSession } from "@app/lib/auth";
import {
  fetchUserFromSession,
  maybeUpdateFromExternalUser,
} from "@app/lib/iam/users";
import { Membership, Workspace } from "@app/lib/models";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

export function isGoogleSession(session: any) {
  return session.provider.provider === "google";
}

/**
 * Retrieves the user for a given session
 * @param session any NextAuth session
 * @returns Promise<UserType | null>
 */
export async function getUserFromSession(
  session: any
): Promise<UserTypeWithWorkspaces | null> {
  if (!session) {
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

interface WithGetServerSidePropsRequirementsOptions {
  enableLogging?: boolean;
  requireAuth?: boolean;
}

const defaultWithGetServerSidePropsRequirements: WithGetServerSidePropsRequirementsOptions =
  {
    enableLogging: true,
    requireAuth: true,
  };

export function withGetServerSidePropsRequirements<
  T extends { [key: string]: any } = { [key: string]: any }
>(
  getServerSideProps: GetServerSideProps<T>,
  opts: WithGetServerSidePropsRequirementsOptions = defaultWithGetServerSidePropsRequirements
): GetServerSideProps<T> {
  return async (
    context: GetServerSidePropsContext<ParsedUrlQuery, PreviewData>
  ) => {
    const { enableLogging, requireAuth } = opts;

    if (requireAuth) {
      const session = await getSession(context.req, context.res);
      if (!session) {
        return {
          redirect: {
            permanent: false,
            // TODO(2024-03-04 flav) Add support for `returnTo=`.
            destination: "/",
          },
        };
      }
    }

    if (enableLogging) {
      return withGetServerSidePropsLogging(getServerSideProps)(context);
    }

    return getServerSideProps(context);
  };
}
