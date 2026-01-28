import type { ReactElement } from "react";

import { FramePage } from "@app/components/poke/pages/FramePage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/auth/pokeServerSideProps";
import { pokeGetServerSideProps } from "@app/lib/auth/pokeServerSideProps";

export const getServerSideProps = pokeGetServerSideProps;

const Page = FramePage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout
      title={`${pageProps.workspace?.name ?? "Workspace"} - File`}
      authContext={pageProps}
    >
      {page}
    </PokeLayout>
  );
};

export default Page;
