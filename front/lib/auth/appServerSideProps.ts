import type { ReactElement } from "react";

import type {
  AuthContextUserOnlyValue,
  AuthContextValue,
} from "@app/lib/auth/AuthContext";
import {
  getUserFromSession,
  makeGetServerSidePropsRequirementsWrapper,
  withDefaultUserAuthPaywallWhitelisted,
  withDefaultUserAuthRequirements,
} from "@app/lib/iam/session";

// Type for page components with a getLayout function.
export type AppPageWithLayout<P = object> = React.FC<P> & {
  getLayout?: (page: ReactElement, pageProps: AuthContextValue) => ReactElement;
};

// Type for page components with user-only auth (no workspace).
export type AppPageWithLayoutUserOnly<P = object> = React.FC<P> & {
  getLayout?: (
    page: ReactElement,
    pageProps: AuthContextUserOnlyValue
  ) => ReactElement;
};

export const appGetServerSideProps =
  withDefaultUserAuthRequirements<AuthContextValue>(async (_context, auth) => {
    return {
      props: {
        workspace: auth.getNonNullableWorkspace(),
        subscription: auth.getNonNullableSubscription(),
        user: auth.getNonNullableUser().toJSON(),
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
      },
    };
  });

export const appGetServerSidePropsForBuilders =
  withDefaultUserAuthRequirements<AuthContextValue>(async (_context, auth) => {
    if (!auth.isBuilder()) {
      return {
        notFound: true,
      };
    }

    return {
      props: {
        workspace: auth.getNonNullableWorkspace(),
        subscription: auth.getNonNullableSubscription(),
        user: auth.getNonNullableUser().toJSON(),
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
      },
    };
  });

export const appGetServerSidePropsForAdmin =
  withDefaultUserAuthRequirements<AuthContextValue>(async (_context, auth) => {
    if (!auth.isAdmin()) {
      return {
        notFound: true,
      };
    }

    return {
      props: {
        workspace: auth.getNonNullableWorkspace(),
        subscription: auth.getNonNullableSubscription(),
        user: auth.getNonNullableUser().toJSON(),
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
      },
    };
  });

export const appGetServerSidePropsPaywallWhitelisted =
  withDefaultUserAuthPaywallWhitelisted<AuthContextValue>(
    async (_context, auth) => {
      if (!auth.workspace() || !auth.isUser()) {
        return {
          notFound: true,
        };
      }

      return {
        props: {
          workspace: auth.getNonNullableWorkspace(),
          subscription: auth.getNonNullableSubscription(),
          user: auth.getNonNullableUser().toJSON(),
          isAdmin: auth.isAdmin(),
          isBuilder: auth.isBuilder(),
        },
      };
    }
  );

export const appGetServerSidePropsPaywallWhitelistedForAdmin =
  withDefaultUserAuthPaywallWhitelisted<AuthContextValue>(
    async (_context, auth) => {
      if (!auth.workspace() || !auth.isAdmin()) {
        return {
          notFound: true,
        };
      }

      return {
        props: {
          workspace: auth.getNonNullableWorkspace(),
          subscription: auth.getNonNullableSubscription(),
          user: auth.getNonNullableUser().toJSON(),
          isAdmin: auth.isAdmin(),
          isBuilder: auth.isBuilder(),
        },
      };
    }
  );

// User-only auth helper for pages that require authentication but no workspace context.
// This is useful for OAuth callbacks or other global pages that need an authenticated user.
export const appGetServerSidePropsUserOnly =
  makeGetServerSidePropsRequirementsWrapper({
    requireUserPrivilege: "user",
    requireCanUseProduct: false,
  })<AuthContextUserOnlyValue>(async (_context, _auth, session) => {
    // Session is guaranteed to exist because requireUserPrivilege is "user"
    // which redirects to login if no session.
    const user = await getUserFromSession(session);

    if (!user) {
      return {
        notFound: true,
      };
    }

    return {
      props: {
        user,
      },
    };
  });
