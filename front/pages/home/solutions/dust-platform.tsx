import { ExtensibilitySection } from "@app/components/home/content/Product/ExtensibilitySection";
import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
import { ImgBlock, QuoteSection } from "@app/components/home/ContentBlocks";
import { Grid, H1, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import { classNames } from "@app/lib/utils";
import { Button, Div3D, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

export async function getServerSideProps() {
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
    "https://fast.wistia.net/embed/iframe/v90n8beuh9?seo=true&videoFoam=true",
};

export default function DustPlatform() {
  return (
    <>
      <div
        className={classNames(
          "flex flex-col justify-end gap-4 pt-12 sm:pt-12 lg:pt-24",
          "col-span-10"
        )}
      >
        <P size="lg" className="text-muted-foreground">
          Dust Platform
        </P>
        <H1 from="from-amber-200" to="to-amber-400">
          For Developers
        </H1>
        <P size="lg" className="text-slate-50">
          Push the boundaries by building custom actions and integrations
          to&nbsp;fit your team's exact&nbsp;needs.
        </P>
        <div className="flex flex-col gap-4 xs:flex-row sm:flex-row md:flex-row">
          <Button
            variant="primary"
            label="Go to Documentation"
            size="md"
            className="mt-8"
            href="https://docs.dust.tt"
            target="_blank"
          />
        </div>
      </div>
      <Grid>
        <div
          className={classNames(
            "col-span-12 grid grid-cols-1 gap-8",
            "md:grid-cols-2"
            // "lg:col-span-10 lg:col-start-1"
          )}
        >
          <ImgBlock
            title={<>Dust Apps: Expand your&nbsp;agents' capabilities</>}
            content={[
              <>
                Orchestrate complex workflows by calling models, APIs, executing
                code, or consulting data sources. Build custom actions, chain
                models, or&nbsp;even call into&nbsp;your&nbsp;own
                infrastructure.
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
      <ExtensibilitySection />
      <QuoteSection
        quote="Dust functions as a 'meta-platform.' Its aggregation approach offers flexibility, allowing us to leverage multiple data sources across tools and avoid being locked into specific tools or vertical ecosystems."
        name="Charles Gorintin"
        title="CTO at Alan"
        logo="/static/landing/logos/alan.png"
      />
      <div
        className={classNames(
          "col-span-12 flex flex-col items-center",
          "lg:col-span-12 lg:col-start-1",
          "xl:col-span-10 xl:col-start-2"
        )}
      >
        <div className="mt-4 flex justify-center gap-4">
          <Link href="home/contact" shallow={true}>
            <Button variant="outline" size="md" label="Request a demo" />
          </Link>

          <Link href="home/pricing" shallow={true}>
            <Button
              variant="highlight"
              size="md"
              label="Try Dust now"
              icon={RocketIcon}
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
