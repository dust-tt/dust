import type {
  AuthContextNoWorkspaceValue,
  AuthContextValue,
} from "@app/lib/auth/AuthContext";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { ReactElement } from "react";

export type PageWithLayout<P = object> = React.FC<P> & {
  getLayout?: (page: ReactElement, pageProps: AuthContextValue) => ReactElement;
};

export type PageWithLayoutNoWorkspace<P = object> = React.FC<P> & {
  getLayout?: (
    page: ReactElement,
    pageProps: AuthContextNoWorkspaceValue
  ) => ReactElement;
};

export const pokeGetServerSideProps =
  withSuperUserAuthRequirements<AuthContextValue>(async (_context, auth) => {
    const workspace = auth.workspace();

    if (!workspace) {
      return {
        notFound: true,
      };
    }

    const subscription = auth.getNonNullableSubscription();

    return {
      props: {
        workspace,
        subscription,
        user: auth.getNonNullableUser().toJSON(),
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
      },
    };
  });

export const pokeGetServerSidePropsNoWorkspace =
  withSuperUserAuthRequirements<AuthContextNoWorkspaceValue>(
    async (_context, auth) => {
      return {
        props: {
          user: auth.user()?.toJSON() ?? null,
          isSuperUser: true,
        },
      };
    }
  );
