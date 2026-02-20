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

// Returns a redirect if the workspace should use the SPA, or the feature flags
// for inclusion in the SSR props.
const checkSpaRedirectAndGetFeatureFlags = async (
  context: GetServerSidePropsContext,
  auth: Authenticator
): Promise<
  | { type: "redirect"; redirect: { destination: string; permanent: false } }
  | { type: "flags"; featureFlags: WhitelistableFeature[] }
> => {
  const isEdge = process.env.NEXT_PUBLIC_DATADOG_SERVICE === "front-edge";

  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);

  if (!isEdge && !featureFlags.includes("dust_no_spa")) {
    const appUrl = config.getAppUrl(true) || DEFAULT_APP_URL;

    const destination = context.resolvedUrl;
    return {
      type: "redirect",
      redirect: {
        destination: `${appUrl}${destination}`,
        permanent: false,
      },
    };
  }

  return { type: "flags", featureFlags };
};

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
    },
  };
}

export const appGetServerSideProps =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    const result = await checkSpaRedirectAndGetFeatureFlags(context, auth);
    if (result.type === "redirect") {
      return { redirect: result.redirect };
    }
    return makeAuthProps(auth, result.featureFlags);
  });

export const appGetServerSidePropsForBuilders =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    if (!auth.isBuilder()) {
      return {
        notFound: true,
      };
    }

    const result = await checkSpaRedirectAndGetFeatureFlags(context, auth);
    if (result.type === "redirect") {
      return { redirect: result.redirect };
    }
    return makeAuthProps(auth, result.featureFlags);
  });

export const appGetServerSidePropsForAdmin =
  withDefaultUserAuthRequirements<AuthContextValue>(async (context, auth) => {
    if (!auth.isAdmin()) {
      return {
        notFound: true,
      };
    }

    const result = await checkSpaRedirectAndGetFeatureFlags(context, auth);
    if (result.type === "redirect") {
      return { redirect: result.redirect };
    }
    return makeAuthProps(auth, result.featureFlags);
  });

export const appGetServerSidePropsPaywallWhitelisted =
  withDefaultUserAuthPaywallWhitelisted<AuthContextValue>(
    async (context, auth) => {
      if (!auth.workspace() || !auth.isUser()) {
        return {
          notFound: true,
        };
      }

      const result = await checkSpaRedirectAndGetFeatureFlags(context, auth);
      if (result.type === "redirect") {
        return { redirect: result.redirect };
      }
      return makeAuthProps(auth, result.featureFlags);
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

      const result = await checkSpaRedirectAndGetFeatureFlags(context, auth);
      if (result.type === "redirect") {
        return { redirect: result.redirect };
      }
      return makeAuthProps(auth, result.featureFlags);
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
