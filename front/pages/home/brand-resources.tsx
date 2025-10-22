import { Button } from "@dust-tt/sparkle";
import Head from "next/head";
import type { ReactElement } from "react";

import {
  Grid,
  H1,
  H2,
  P,
  Strong,
} from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";

export async function getStaticProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.icosahedron),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const ASSET_BASE_PATH = "/static/landing/logos/dust";

interface BrandResourcesProps {}

export default function BrandResources({}: BrandResourcesProps) {
  return (
    <>
      <Head>
        <title>Brand resources - Dust</title>
        <meta
          name="description"
          content="Download official Dust logos in SVG and PNG formats. Includes primary and square logo variants with usage guidelines."
        />
        <meta property="og:title" content="Brand resources - Dust" />
        <meta
          property="og:description"
          content="Download official Dust logos in SVG and PNG formats. Includes primary and square logo variants with usage guidelines."
        />
      </Head>

      <div className="container flex w-full flex-col gap-16 px-6 md:gap-20">
        <Grid>
          <div className="col-span-12 col-start-1 flex flex-col gap-2 pt-24 md:col-span-10 md:col-start-2">
            <H1 mono className="text-5xl font-medium md:text-6xl lg:text-7xl">
              Brand resources
            </H1>
            <P size="lg" className="text-muted-foreground">
              Download official Dust logos and follow the guidelines below for
              proper usage.
            </P>
          </div>
        </Grid>

        <Grid>
          <div className="col-span-12 col-start-1 grid grid-cols-12 gap-6 md:col-span-10 md:col-start-2">
            <div className="col-span-12 flex flex-col justify-center gap-4 xl:col-span-6">
              <div className="flex flex-col gap-2">
                <H2>Media assets</H2>
                <P className="text-muted-foreground">
                  The Dust wordmark is available in two shapes: primary and
                  square.
                </P>
              </div>
              <div>
                <Button
                  href={`${ASSET_BASE_PATH}/Dust_Brand_Logo.zip`}
                  variant="primary"
                  size="md"
                  label="Download brand kit"
                  download
                />
              </div>
            </div>
            <div className="col-span-12 xl:col-span-5 xl:col-start-8">
              <img
                src={`${ASSET_BASE_PATH}/brand_ressources_logos.svg`}
                alt="Dust logo variants"
                className="w-full"
              />
            </div>
          </div>
        </Grid>

        <Grid>
          <div className="col-span-12 col-start-1 flex flex-col gap-4 md:col-span-10 md:col-start-2">
            <H2>Guidelines</H2>
            <div className="flex flex-col gap-2 text-muted-foreground">
              <P size="sm">
                <Strong>Clear space:</Strong> Keep ample space around the logo
                for legibility. Avoid crowding with text or graphics.
              </P>
              <P size="sm">
                <Strong>Do not modify:</Strong> Don't rotate, recolor, stretch,
                add effects, or alter proportions of the logo.
              </P>
              <P size="sm">
                <Strong>Minimum size:</Strong> Ensure the logo remains crisp and
                readable. Avoid rendering smaller than 24px in height.
              </P>
            </div>
          </div>
        </Grid>
      </div>
    </>
  );
}

BrandResources.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
