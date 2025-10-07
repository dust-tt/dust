import { Button, Div3D, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import { ExtensibilitySection } from "@app/components/home/content/Product/ExtensibilitySection";
import { PlatformIntroSection } from "@app/components/home/content/Product/PlatformIntroSection";
import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { ImgBlock, QuoteSection } from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";

export async function getStaticProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.galaxy),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/3ej9a2ruip?web_component=true&seo=true",
};

export default function DustPlatform() {
  return (
    <>
      <PlatformIntroSection />
      <Grid>
        <div
          className={classNames(
            "col-span-12 grid grid-cols-1 gap-8",
            "md:grid-cols-3"
          )}
        >
          <ImgBlock
            title={<>MCP: Integrate custom tools into Dust agents</>}
            content={[
              <>
                Seamlessly connect your own and external tools to Dust agents
                using MCP servers. Customize agent capabilities, manage
                authentication, and control access—all through a flexible
                integration framework.
              </>,
            ]}
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/api/MCP1.png" />
              </Div3D>
              <Div3D depth={40} className="absolute top-0">
                <img src="/static/landing/api/MCP2.png" />
              </Div3D>
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/api/MCP3.png" />
              </Div3D>
              <Div3D depth={40} className="absolute top-0">
                <img src="/static/landing/api/MCP4.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>
          <ImgBlock
            title={<>Dust Apps: Expand your agents' capabilities</>}
            content={[
              <>
                Orchestrate complex workflows by calling models, APIs, executing
                code, or consulting data sources. Build custom actions, chain
                models, or even call into your own infrastructure.
              </>,
            ]}
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/apps/apps1.png" />
              </Div3D>
              <Div3D depth={0} className="absolute top-0">
                <img src="/static/landing/apps/apps2.png" />
              </Div3D>
              <Div3D depth={15} className="absolute top-0">
                <img src="/static/landing/apps/apps3.png" />
              </Div3D>
              <Div3D depth={60} className="absolute top-0">
                <img src="/static/landing/apps/apps4.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>
          <ImgBlock
            title={<>Dust API: Integrate Dust across your tools</>}
            content={[
              <>
                Access Dust's capabilities through a developer API to manage
                agents and data sources programmatically. Use Dust on your terms
                and on the product surfaces of your choice.
              </>,
            ]}
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
              <Div3D depth={-20}>
                <img src="/static/landing/api/api1.png" />
              </Div3D>
              <Div3D depth={20} className="absolute top-0">
                <img src="/static/landing/api/api2.png" />
              </Div3D>
              <Div3D depth={60} className="absolute top-0">
                <img src="/static/landing/api/api3.png" />
              </Div3D>
            </Hover3D>
          </ImgBlock>
        </div>
      </Grid>
      <ExtensibilitySection page="platform" />
      <DemoVideoSection demoVideo={DemoVideo} />
      <QuoteSection
        quote="Dust functions as a 'meta-platform.' Its aggregation approach offers flexibility, allowing us to leverage multiple data sources across tools and avoid being locked into specific tools or vertical ecosystems."
        name="Charles Gorintin"
        title="CTO at Alan"
        logo="/static/landing/logos/color/alan.png"
      />
      <div
        className={classNames(
          "col-span-12 flex flex-col items-center",
          "lg:col-span-12 lg:col-start-1",
          "xl:col-span-10 xl:col-start-2"
        )}
      >
        <div className="mt-4 flex justify-center gap-4">
          <Link href="/home/contact" shallow={true}>
            <Button
              variant="outline"
              size="md"
              label="Request a demo"
              onClick={withTracking(
                TRACKING_AREAS.SOLUTIONS,
                "platform_footer_cta_secondary"
              )}
            />
          </Link>

          <Link href="/home/pricing" shallow={true}>
            <Button
              variant="highlight"
              size="md"
              label="Try Dust now"
              icon={RocketIcon}
              onClick={withTracking(
                TRACKING_AREAS.SOLUTIONS,
                "platform_footer_cta_primary"
              )}
            />
          </Link>
        </div>
      </div>
    </>
  );
}

DustPlatform.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
