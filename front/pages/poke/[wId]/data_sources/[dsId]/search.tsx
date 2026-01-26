import type { ReactElement } from "react";

import { DataSourceSearchPage } from "@app/components/poke/pages/DataSourceSearchPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/poke/common";
import { pokeGetServerSideProps } from "@app/lib/poke/common";

export const getServerSideProps = pokeGetServerSideProps;

const Page = DataSourceSearchPage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout
      title={`${pageProps.workspace?.name ?? "Workspace"} - Search`}
      authContext={pageProps}
    >
      {page}
    </PokeLayout>
  );
};

export default Page;
