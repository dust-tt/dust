// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import {
  withDefaultUserAuthPaywallWhitelisted,
  withDefaultUserAuthRequirements,
  withPublicAuthRequirements,
} from "@app/lib/iam/session";
import { isDevelopment } from "@app/types/shared/env";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";

// Type for page components with a getLayout function.
export type AppPageWithLayout<P = object> = React.FC<P> & {
  getLayout?: (page: ReactElement, pageProps: AuthContextValue) => ReactElement;
};

const DEFAULT_APP_URL = isDevelopment()
  ? "http://localhost:3011"
  : "https://app.dust.tt";

function getSpaRedirect(
  context: GetServerSidePropsContext,
  featureFlags: WhitelistableFeature[]
): { destination: string; permanent: false } | null {
  const isEdge = process.env.NEXT_PUBLIC_DATADOG_SERVICE === "front-edge";

  if (!isEdge && !featureFlags.includes("dust_no_spa")) {
    const appUrl = config.getAppUrl(true) || DEFAULT_APP_URL;
    return { destination: `${appUrl}${context.resolvedUrl}`, permanent: false };
  }

  return null;
}

function makeAuthProps(
  auth: Authenticator,
  featureFlags: WhitelistableFeature[]
): { props: AuthContextValue } {
  return {
    props: {
      workspace: auth.getNonNullableWorkspace(),
      subscription: auth.getNonNullableSubscription(),
      user: auth.getNonNullableUser().toJSON(),
      isAdmin: auth.isAdmin(),
      isBuilder: auth.isBuilder(),
      featureFlags,
      vizUrl: config.getVizPublicUrl(),
    },
  };
}

export const appGetServerSideProps =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
    const redirect = getSpaRedirect(context, featureFlags);
    if (redirect) {
      return { redirect };
    }
    return makeAuthProps(auth, featureFlags);
  });

export const appGetServerSidePropsForBuilders =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    if (!auth.isBuilder()) {
      return { notFound: true };
    }

    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
    const redirect = getSpaRedirect(context, featureFlags);
    if (redirect) {
      return { redirect };
    }
    return makeAuthProps(auth, featureFlags);
  });

export const appGetServerSidePropsForAdmin =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    if (!auth.isAdmin()) {
      return { notFound: true };
    }

    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
    const redirect = getSpaRedirect(context, featureFlags);
    if (redirect) {
      return { redirect };
    }
    return makeAuthProps(auth, featureFlags);
  });

export const appGetServerSidePropsPaywallWhitelisted =
  withDefaultUserAuthPaywallWhitelisted<AuthContextValue>(
    async (context, auth) => {
      if (!auth.workspace() || !auth.isUser()) {
        return { notFound: true };
      }

      const featureFlags = await getFeatureFlags(
        auth.getNonNullableWorkspace()
      );
      const redirect = getSpaRedirect(context, featureFlags);
      if (redirect) {
        return { redirect };
      }
      return makeAuthProps(auth, featureFlags);
    }
  );

export const appGetServerSidePropsPaywallWhitelistedForAdmin =
  withDefaultUserAuthPaywallWhitelisted<AuthContextValue>(
    async (context, auth) => {
      if (!auth.workspace() || !auth.isAdmin()) {
        return { notFound: true };
      }

      const featureFlags = await getFeatureFlags(
        auth.getNonNullableWorkspace()
      );
      const redirect = getSpaRedirect(context, featureFlags);
      if (redirect) {
        return { redirect };
      }
      return makeAuthProps(auth, featureFlags);
    }
  );

// For authenticated pages outside workspace context (e.g. /invite-choose, /no-workspace).
// Checks session only — redirects to login if unauthenticated, no workspace required.
export const appGetServerSidePropsForUserNoWorkspace =
  withDefaultUserAuthPaywallWhitelisted<object>(async () => {
    return { props: {} };
  });

// For public pages that don't require authentication
export const appGetServerSidePropsPublic = withPublicAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);
