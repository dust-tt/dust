import type { ReactElement } from "react";

import { DataSourcePage } from "@app/components/poke/pages/DataSourcePage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/auth/pokeServerSideProps";
import { pokeGetServerSideProps } from "@app/lib/auth/pokeServerSideProps";

export const getServerSideProps = pokeGetServerSideProps;

const Page = DataSourcePage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout
      title={`${pageProps.workspace?.name ?? "Workspace"} - Data Source`}
      authContext={pageProps}
    >
      {page}
    </PokeLayout>
  );
};

export default Page;
