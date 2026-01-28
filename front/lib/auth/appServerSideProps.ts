import type { ReactElement } from "react";

import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

// Type for page components with a getLayout function.
export type AppPageWithLayout<P = object> = React.FC<P> & {
  getLayout?: (page: ReactElement, pageProps: AuthContextValue) => ReactElement;
};

export const appGetServerSideProps =
  withDefaultUserAuthRequirements<AuthContextValue>(async (_context, auth) => {
    return {
      props: {
        workspace: auth.getNonNullableWorkspace(),
        subscription: auth.getNonNullableSubscription(),
        user: auth.user()?.toJSON() ?? null,
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
        isSuperUser: false,
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
        user: auth.user()?.toJSON() ?? null,
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
        isSuperUser: false,
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
        user: auth.user()?.toJSON() ?? null,
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
        isSuperUser: false,
      },
    };
  });
