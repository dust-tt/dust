import type { ReactElement } from "react";

import { DashboardPage } from "@app/components/poke/pages/DashboardPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/poke/common";
import { pokeGetServerSidePropsNoWorkspace } from "@app/lib/poke/common";

export const getServerSideProps = pokeGetServerSidePropsNoWorkspace;

const Page = DashboardPage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout title="Home" authContext={pageProps}>
      {page}
    </PokeLayout>
  );
};

export default Page;
