import type { ReactElement } from "react";

import { LLMTracePage } from "@app/components/poke/pages/LLMTracePage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/auth/pokeServerSideProps";
import { pokeGetServerSideProps } from "@app/lib/auth/pokeServerSideProps";

export const getServerSideProps = pokeGetServerSideProps;

const Page = LLMTracePage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return <PokeLayout authContext={pageProps}>{page}</PokeLayout>;
};

export default Page;
