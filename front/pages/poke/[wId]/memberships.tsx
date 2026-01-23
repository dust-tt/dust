import type { ReactElement } from "react";

import { MembershipsPage } from "@app/components/poke/pages/MembershipsPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type {PageWithLayout} from "@app/lib/poke/common";
import { pokeGetServerSideProps } from "@app/lib/poke/common";

export const getServerSideProps = pokeGetServerSideProps;

const Page = MembershipsPage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout
      title={`${pageProps.workspace?.name ?? "Workspace"} - Memberships`}
      authContext={pageProps}
    >
      {page}
    </PokeLayout>
  );
};

export default Page;
