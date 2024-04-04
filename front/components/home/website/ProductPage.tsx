import type { ParsedUrlQuery } from "querystring";
import React from "react";

import { BlogBlock } from "@app/components/home/contentBlocks";
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
        <BlogBlock
          title="Navigating Growth and Innovation with November Five’s Dario Prskalo"
          content="Discover how November Five leverages AI with Dust to enhance efficiency and maintain a human touch in their digital solutions."
          href="https://blog.dust.tt/november-five-ai-transformation-dust/"
        >
          <img
            src="https://blog.dust.tt/content/images/size/w2000/2024/04/DSCF6552-1.jpeg"
            alt="Blog Image"
          />
        </BlogBlock>
        <BlogBlock
          title="How Eléonore improved the efficiency of Pennylane’s Care team thanks to Dust"
          content="Discover how Pennylane leveraged Dust’s specialized virtual assistants to improve efficiency and optimize workflows."
          href="https://blog.dust.tt/pennylane-dust-customer-support-journey/"
        >
          <img
            src="https://blog.dust.tt/content/images/size/w2000/2024/04/Ele-onore-MOTTE--1--1.jpg"
            alt="Blog Image"
          />
        </BlogBlock>
        <BlogBlock
          title="Integrating AI for Enhanced Workflows at Alan"
          content="Discover how Alan revolutionizes healthcare and enhances workflows using AI. See how @code-help and Dust streamline developer tasks."
          href="https://blog.dust.tt/integrating-ai-workflows-alan/"
        >
          <img
            src="https://blog.dust.tt/content/images/size/w2000/2024/03/cover-vincent.png"
            alt="Blog Image"
          />
        </BlogBlock>
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
