import type { ParsedUrlQuery } from "querystring";
import React from "react";

import { Grid, H1 } from "@app/components/home/contentComponents";
import { ArtSection } from "@app/components/home/website/Product/ArtSection";
import { IntroSection } from "@app/components/home/website/Product/IntroSection";
import { TeamSection } from "@app/components/home/website/Product/TeamSection";

interface ProductPageProps {
  getReturnToUrl: (routerQuery: ParsedUrlQuery) => string;
}

export function ProductPage({ getReturnToUrl }: ProductPageProps) {
  return (
    <>
      <IntroSection getReturnToUrl={getReturnToUrl} />
      <TeamSection />
      <ArtSection />
      <Grid>
        <H1 className="col-span-12 text-center text-white">
          Links to Blog articles
        </H1>
      </Grid>
      <Grid>
        <H1 className="col-span-12 text-center text-white">
          CAROUSSEL DISPLAY
          <br />
          Connections to "Dust for…" pages, Dust Apps, Security…
        </H1>
      </Grid>{" "}
      <Grid>
        <H1 className="col-span-12 text-center text-white">
          Structured referal section
          <br />
          (post from our users, quotes)
        </H1>
      </Grid>
    </>
  );
}
