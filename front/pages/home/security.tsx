import { ArrowRightIcon, Button, Div3D, Hover3D } from "@dust-tt/sparkle";
import type { ReactElement } from "react";

import {
  Grid,
  H1,
  H2,
  H3,
  P,
  Strong,
} from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import { classNames } from "@app/lib/utils";

export async function getStaticProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.icosahedron),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const GRID_SECTION_CLASSES = classNames(
  "col-span-12",
  "grid grid-cols-1 gap-12 px-6",
  "sm:grid-cols-2 sm:gap-6 sm:pr-0",
  "lg:col-span-10 lg:col-start-2",
  "xl:col-span-12 xl:grid-cols-4"
);

const MainVisualModels = () => (
  <Hover3D depth={-20} perspective={1000} className={classNames("relative")}>
    <Div3D depth={-20}>
      <img src="/static/landing/provider/provider1.png" />
    </Div3D>
    <Div3D depth={20} className="absolute top-0">
      <img src="/static/landing/provider/provider2.png" />
    </Div3D>
    <Div3D depth={40} className="absolute top-0">
      <img src="/static/landing/provider/provider3.png" />
    </Div3D>
    <Div3D depth={70} className="absolute top-0">
      <img src="/static/landing/provider/provider4.png" />
    </Div3D>
  </Hover3D>
);

const MainVisualData = () => (
  <Hover3D depth={-20} perspective={1000} className={classNames("relative")}>
    <Div3D depth={-20}>
      <img src="/static/landing/selection/selection1.png" />
    </Div3D>
    <Div3D depth={20} className="absolute top-0">
      <img src="/static/landing/selection/selection2.png" />
    </Div3D>
    <Div3D depth={40} className="absolute top-0">
      <img src="/static/landing/selection/selection3.png" />
    </Div3D>
    <Div3D depth={70} className="absolute top-0">
      <img src="/static/landing/selection/selection4.png" />
    </Div3D>
  </Hover3D>
);

const MainVisualUsers = () => (
  <Hover3D depth={-20} perspective={1000} className={classNames("relative")}>
    <Div3D depth={-20}>
      <img src="/static/landing/member/member1.png" />
    </Div3D>
    <Div3D depth={20} className="absolute top-0">
      <img src="/static/landing/member/member2.png" />
    </Div3D>
    <Div3D depth={40} className="absolute top-0">
      <img src="/static/landing/member/member3.png" />
    </Div3D>
    <Div3D depth={70} className="absolute top-0">
      <img src="/static/landing/member/member4.png" />
    </Div3D>
  </Hover3D>
);

export default function Security() {
  return (
    <>
      <div className="container flex w-full flex-col gap-4 px-6 md:gap-0">
        <Grid>
          <div
            className={classNames(
              "flex flex-col justify-end gap-4 pt-24",
              "col-span-10"
            )}
          >
            <H3 className="text-muted-foreground">Designed for enterprises</H3>
            <H1
              mono
              className="text-5xl font-medium leading-tight md:text-6xl lg:text-7xl"
            >
              Enterprise-grade Security
            </H1>
            <P size="lg" className="text-muted-foreground">
              We've made security our core focus from day&nbsp;one to safeguard
              your&nbsp;company&nbsp;data and workspace&nbsp;privacy. <br></br>
              <Strong>
                GDPR Compliant & SOC2 Type II Certified. Enables HIPAA
                compliance.
              </Strong>
            </P>
            <div className="flex flex-col items-center gap-12 py-8 lg:flex-row">
              <div className="hidden gap-6 py-8 lg:flex">
                <img src="/static/landing/security/gdpr.svg" className="h-28" />
                <img src="/static/landing/security/soc2.svg" className="h-28" />
                <img src="static/landing/security/hipaa.svg" className="h-28" />
              </div>
              <Button
                href="https://app.vanta.com/dust.tt/trust/f3ytzxpay31bwsiyuqjto"
                variant="highlight"
                size="md"
                icon={ArrowRightIcon}
                label="Visit our Trust Center"
                target="_blank"
              />
            </div>
            <div className="flex gap-8"></div>
          </div>
        </Grid>
        <Grid className="md:gap-y-4">
          <div className="col-span-12 flex flex-col justify-center py-4 sm:max-w-[100%] md:max-w-[90%]">
            <H2>Ingest data on your terms</H2>
            <P size="lg" className="pb-6 text-muted-foreground">
              Control data selection and hosting location within rigorous
              security parameters.
            </P>
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <div className="hidden sm:block">
              <MainVisualData />
            </div>
            <P size="md" dotCSS="text-brand-orange-golden" shape="triangle">
              <Strong>Granular Data Selection</Strong>
              <br />
              Fully control which data Dust ingests from each source.
            </P>
            <P size="md" dotCSS="text-brand-red-rose" shape="rectangle">
              <Strong>End-to-End Encryption</Strong>
              <br />
              Data is encrypted with AES-256 at rest, TLS in transit.
            </P>
            <P size="md" dotCSS="text-brand-hunter-green" shape="circle">
              <Strong>Regional Hosting</Strong>
              <br />
              Host in the EU or US to meet your regulatory needs.
            </P>
          </div>
        </Grid>

        <Grid className="mt-12 md:gap-y-4">
          <div className="col-span-12 flex flex-col justify-center py-4 sm:max-w-[100%] md:max-w-[90%]">
            <H2>Select trusted models, keep data protected</H2>
            <P size="lg" className="pb-6 text-muted-foreground">
              Control risk: only trusted providers, with no data fed into
              training.
            </P>
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <div className="hidden sm:block">
              <MainVisualModels />
            </div>
            <P size="md" dotCSS="text-brand-orange-golden" shape="triangle">
              <Strong>No Model Training</Strong>
              <br />
              Your data is never used to train models.
            </P>
            <P size="md" dotCSS="text-brand-red-rose" shape="rectangle">
              <Strong>Zero Data Retention</Strong>
              <br />
              No data is stored by third-party model providers.
            </P>
            <P size="md" dotCSS="text-brand-hunter-green" shape="circle">
              <Strong>Flexible Providers</Strong>
              <br />
              Pick the providers and embedding models you want.
            </P>
          </div>
        </Grid>

        <Grid className="mt-12 md:gap-y-4">
          <div className="col-span-12 flex flex-col justify-center py-4 sm:max-w-[100%] md:max-w-[90%]">
            <H2>Maintain rigorous access control at all levels</H2>
            <P size="lg" className="pb-6 text-muted-foreground">
              Tailor Dust's features to each user according to specified access
              rights.
            </P>
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <div className="hidden sm:block">
              <MainVisualUsers />
            </div>
            <P size="md" dotCSS="text-brand-orange-golden" shape="triangle">
              <Strong>Single Sign-On (SSO)</Strong>
              <br />
              Use SSO to manage user access across the workspace.
            </P>
            <P size="md" dotCSS="text-brand-red-rose" shape="rectangle">
              <Strong>Role-Based Access</Strong>
              <br />
              Assign user, builder, or admin roles to control permissions.
            </P>
            <P size="md" dotCSS="text-brand-hunter-green" shape="circle">
              <Strong>Private Spaces</Strong>
              <br />
              Use private spaces for sensitive data, restricting access by role.
            </P>
          </div>
        </Grid>
        <div
          className={classNames(
            "col-span-12 mt-8 flex flex-col items-center",
            "lg:col-span-12 lg:col-start-1",
            "xl:col-span-10 xl:col-start-2"
          )}
        >
          <div className="mt-4 flex justify-center gap-4">
            <Button
              href="/home/contact"
              variant="outline"
              size="md"
              label="Contact us"
            />
            <Button
              href="https://app.vanta.com/dust.tt/trust/f3ytzxpay31bwsiyuqjto"
              variant="highlight"
              size="md"
              icon={ArrowRightIcon}
              label="Visit our Trust Center"
              target="_blank"
            />
          </div>
        </div>
      </div>
    </>
  );
}

Security.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
