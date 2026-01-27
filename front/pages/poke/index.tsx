import type { ReactElement } from "react";

import { DashboardPage } from "@app/components/poke/pages/DashboardPage";
import { PokeLayoutNoWorkspace } from "@app/components/poke/PokeLayout";
import type { AuthContextNoWorkspaceValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayoutNoWorkspace } from "@app/lib/auth/pokeServerSideProps";
import { pokeGetServerSidePropsNoWorkspace } from "@app/lib/auth/pokeServerSideProps";

export const getServerSideProps = pokeGetServerSidePropsNoWorkspace;

const Page = DashboardPage as PageWithLayoutNoWorkspace;

Page.getLayout = (
  page: ReactElement,
  pageProps: AuthContextNoWorkspaceValue
) => {
  return (
    <PokeLayoutNoWorkspace title="Home" authContext={pageProps}>
      {page}
    </PokeLayoutNoWorkspace>
  );
};

export default Page;
