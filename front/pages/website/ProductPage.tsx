import React from "react";

import { Grid, H1 } from "@app/components/home/contentComponents";
import { ArtSection } from "@app/pages/website/Product/ArtSection";
import { IntroSection } from "@app/pages/website/Product/IntroSection";
import { TeamSection } from "@app/pages/website/Product/TeamSection";

export function ProductPage() {
  return (
    <>
      <IntroSection />
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
      {/* Need more? */}
      {/* <Grid>
        <H2 className="order-1 col-span-12 text-emerald-500 md:col-span-6 xl:col-span-5  xl:col-start-2">
          Need more?
          <br />
          <span className="text-emerald-200">Dust do it!</span>
        </H2>

        <Hover3D
          depth={-20}
          perspective={1000}
          className={classNames(
            "relative rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/70 to-gray-900/80 shadow-xl",
            "order-2",
            "col-span-10 col-start-2",
            "sm:col-span-8 sm:col-start-3",
            "md:col-span-6 md:col-start-auto md:row-span-3 md:self-center",
            "xl:col-span-5",
            "2xl:col-span-4"
          )}
        >
          <Div3D depth={30}>
            <img src="/static/landing/apps_0.png" />
          </Div3D>
          <Div3D depth={70} className="absolute top-0">
            <img src="/static/landing/apps_1.png" />
          </Div3D>
        </Hover3D>
        <P
          size="lg"
          className="order-3 col-span-6 lg:col-span-5 xl:col-start-2"
        >
          Provide <Strong>developers and tinkerers with a&nbsp;platform</Strong>{" "}
          to&nbsp;build custom actions and&nbsp;application orchestration
          to&nbsp;fit your team’s&nbsp;exact&nbsp;needs.
        </P>
        <P
          size="lg"
          className="order-4 col-span-6 lg:col-span-5 xl:col-start-2"
        >
          Support <Strong>custom plugins</Strong> for assistants to interact
          with your <Strong>own databases on advanced use cases</Strong>.
        </P>
      </Grid> */}
    </>
  );
}
