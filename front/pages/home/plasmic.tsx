import type { ComponentRenderData } from "@plasmicapp/loader-nextjs";
import {
  extractPlasmicQueryData,
  PlasmicComponent,
  PlasmicRootProvider,
} from "@plasmicapp/loader-nextjs";
import type { GetStaticProps } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PLASMIC } from "@app/plasmic-init";

export const getStaticProps: GetStaticProps = async () => {
  const plasmicData = await PLASMIC.fetchComponentData("Homepage");

  if (plasmicData == null) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const compMeta = plasmicData.entryCompMetas[0];

  const queryCache = await extractPlasmicQueryData(
    <PlasmicRootProvider
      loader={PLASMIC}
      prefetchedData={plasmicData}
      pageRoute={compMeta.path}
      pageParams={compMeta.params}
    >
      <PlasmicComponent component={compMeta.displayName} />
    </PlasmicRootProvider>
  );

  return {
    props: {
      plasmicData,
      queryCache,
    },
    revalidate: 300,
  };
};

export default function PlasmicPage({
  plasmicData,
  queryCache,
}: {
  plasmicData: ComponentRenderData;
  queryCache: Record<string, any>;
}) {
  const router = useRouter();
  const compMeta = plasmicData.entryCompMetas[0];

  return (
    <PlasmicRootProvider
      loader={PLASMIC}
      prefetchedData={plasmicData}
      prefetchedQueryData={queryCache}
      pageRoute={compMeta.path}
      pageParams={compMeta.params}
      pageQuery={router.query}
    >
      <PlasmicComponent component={compMeta.displayName} />
    </PlasmicRootProvider>
  );
}

PlasmicPage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
