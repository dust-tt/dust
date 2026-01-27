import type { ReactElement } from "react";

import { ConnectorRedirectPage } from "@app/components/poke/pages/ConnectorRedirectPage";
import { PokeLayoutNoWorkspace } from "@app/components/poke/PokeLayout";
import type { AuthContextNoWorkspaceValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayoutNoWorkspace } from "@app/lib/auth/pokeServerSideProps";
import { pokeGetServerSidePropsNoWorkspace } from "@app/lib/auth/pokeServerSideProps";

export const getServerSideProps = pokeGetServerSidePropsNoWorkspace;

const Page = ConnectorRedirectPage as PageWithLayoutNoWorkspace;

Page.getLayout = (
  page: ReactElement,
  pageProps: AuthContextNoWorkspaceValue
) => {
  return (
    <PokeLayoutNoWorkspace title="Connector Redirect" authContext={pageProps}>
      {page}
    </PokeLayoutNoWorkspace>
  );
};

export default Page;
