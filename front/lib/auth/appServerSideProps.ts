import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import {
  withDefaultUserAuthPaywallWhitelisted,
  withDefaultUserAuthRequirements,
  withPublicAuthRequirements,
} from "@app/lib/iam/session";
import { isDevelopment } from "@app/types";

// Type for page components with a getLayout function.
export type AppPageWithLayout<P = object> = React.FC<P> & {
  getLayout?: (page: ReactElement, pageProps: AuthContextValue) => ReactElement;
};

const DEFAULT_APP_URL = isDevelopment()
  ? "http://localhost:3011"
  : "https://app.dust.tt";

const redirectToDustSpa = async (
  context: GetServerSidePropsContext,
  auth: Authenticator
) => {
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);

  if (featureFlags.includes("dust_spa")) {
    const appUrl = config.getAppUrl(true) || DEFAULT_APP_URL;

    const destination = context.resolvedUrl;
    return {
      redirect: {
        destination: `${appUrl}${destination}`,
        permanent: false,
      },
    };
  }

  return null;
};

export const appGetServerSideProps =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    const redirect = await redirectToDustSpa(context, auth);
    return (
      redirect ?? {
        props: {
          workspace: auth.getNonNullableWorkspace(),
          subscription: auth.getNonNullableSubscription(),
          user: auth.getNonNullableUser().toJSON(),
          isAdmin: auth.isAdmin(),
          isBuilder: auth.isBuilder(),
        },
      }
    );
  });

export const appGetServerSidePropsForBuilders =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    if (!auth.isBuilder()) {
      return {
        notFound: true,
      };
    }

    const redirect = await redirectToDustSpa(context, auth);

    return (
      redirect ?? {
        props: {
          workspace: auth.getNonNullableWorkspace(),
          subscription: auth.getNonNullableSubscription(),
          user: auth.getNonNullableUser().toJSON(),
          isAdmin: auth.isAdmin(),
          isBuilder: auth.isBuilder(),
        },
      }
    );
  });

export const appGetServerSidePropsForAdmin =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    if (!auth.isAdmin()) {
      return {
        notFound: true,
      };
    }

    const redirect = await redirectToDustSpa(context, auth);

    return (
      redirect ?? {
        props: {
          workspace: auth.getNonNullableWorkspace(),
          subscription: auth.getNonNullableSubscription(),
          user: auth.getNonNullableUser().toJSON(),
          isAdmin: auth.isAdmin(),
          isBuilder: auth.isBuilder(),
        },
      }
    );
  });

export const appGetServerSidePropsPaywallWhitelisted =
  withDefaultUserAuthPaywallWhitelisted<AuthContextValue>(
    async (context, auth) => {
      if (!auth.workspace() || !auth.isUser()) {
        return {
          notFound: true,
        };
      }

      const redirect = await redirectToDustSpa(context, auth);

      return (
        redirect ?? {
          props: {
            workspace: auth.getNonNullableWorkspace(),
            subscription: auth.getNonNullableSubscription(),
            user: auth.getNonNullableUser().toJSON(),
            isAdmin: auth.isAdmin(),
            isBuilder: auth.isBuilder(),
          },
        }
      );
    }
  );

export const appGetServerSidePropsPaywallWhitelistedForAdmin =
  withDefaultUserAuthPaywallWhitelisted<AuthContextValue>(
    async (context, auth) => {
      if (!auth.workspace() || !auth.isAdmin()) {
        return {
          notFound: true,
        };
      }

      const redirect = await redirectToDustSpa(context, auth);

      return (
        redirect ?? {
          props: {
            workspace: auth.getNonNullableWorkspace(),
            subscription: auth.getNonNullableSubscription(),
            user: auth.getNonNullableUser().toJSON(),
            isAdmin: auth.isAdmin(),
            isBuilder: auth.isBuilder(),
          },
        }
      );
    }
  );

// For public pages that don't require authentication
export const appGetServerSidePropsPublic = withPublicAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);
