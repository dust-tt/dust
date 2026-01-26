import type { ReactElement } from "react";

import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

// Type for page components with a getLayout function
export type PageWithLayout<P = object> = React.FC<P> & {
  getLayout?: (page: ReactElement, pageProps: AuthContextValue) => ReactElement;
};

export const pokeGetServerSideProps =
  withSuperUserAuthRequirements<AuthContextValue>(async (_context, auth) => {
    return {
      props: {
        workspace: auth.workspace(),
        subscription: auth.subscription(),
        user: auth.user()?.toJSON() ?? null,
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
        isSuperUser: true,
      },
    };
  });

// Version for pages that don't require a workspace
export const pokeGetServerSidePropsNoWorkspace =
  withSuperUserAuthRequirements<AuthContextValue>(async (_context, auth) => {
    return {
      props: {
        workspace: null,
        subscription: null,
        user: auth.user()?.toJSON() ?? null,
        isAdmin: false,
        isBuilder: false,
        isSuperUser: true,
      },
    };
  });
