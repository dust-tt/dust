import type { ReactElement } from "react";

import { DataSourceQueryPage } from "@app/components/poke/pages/DataSourceQueryPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/auth/pokeServerSideProps";
import { pokeGetServerSideProps } from "@app/lib/auth/pokeServerSideProps";

export const getServerSideProps = pokeGetServerSideProps;

const Page = DataSourceQueryPage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout
      title={`${pageProps.workspace?.name ?? "Workspace"} - Query`}
      authContext={pageProps}
    >
      {page}
    </PokeLayout>
  );
};

export default Page;
