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
// Type for page components with a getLayout function.
export type AppPageWithLayout<P = object> = React.FC<P> & {
  getLayout?: (page: ReactElement, pageProps: AuthContextValue) => ReactElement;
};

const redirectToDustSpa = async (
  context: GetServerSidePropsContext,
  auth: Authenticator
) => {
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);

  if (featureFlags.includes("dust_spa")) {
    // TODO(spa): temporary fallback to app.dust.tt until we remove the feature flag and set the env for all.
    const appUrl = config.getAppUrl(true) || "https://app.dust.tt";

    const destination = context.resolvedUrl;
    return {
      redirect: {
        destination: `${appUrl}${destination}`,
        permanent: true,
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
