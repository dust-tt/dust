import { Div3D, Hover3D } from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import React from "react";

import { classNames } from "@app/lib/utils";
import {
  HeaderContentBlock,
  ImgBlock,
} from "@app/pages/site/components/ContentBlocks";
import {
  A,
  Grid,
  P,
  Strong,
} from "@app/pages/site/components/ContentComponents";
import type { LandingLayoutProps } from "@app/pages/site/components/LandingLayout";
import LandingLayout from "@app/pages/site/components/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/pages/site/components/Particles";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.icosahedron),
    },
  };
}

export default function Security() {
  return (
    <>
      <HeaderContentBlock
        title={<>Security is&nbsp;non-negotiable</>}
        from="from-yellow-200"
        to="to-amber-400"
        uptitle="Designed for enterprises"
        hasCTA={false}
        subtitle={
          <>
            We've made security our core focus from day&nbsp;one to safeguard
            your&nbsp;company&nbsp;data and workspace&nbsp;privacy.
            <div className="flex gap-6 py-8">
              <img src="/static/landing/security/gdpr.svg" className="h-28" />
              <img src="/static/landing/security/soc2.svg" className="h-28" />
            </div>
            <Strong>GDPR Compliant & Soc2 type II certified</Strong>
            <br />
            Learn more about security at&nbsp;Dust in&nbsp;our{" "}
            <A
              href="https://app.vanta.com/dust.tt/trust/f3ytzxpay31bwsiyuqjto"
              target="_blank"
            >
              Trust&nbsp;Center
            </A>
            .
          </>
        }
      />
      <Grid>
        <div
          className={classNames(
            "col-span-12",
            "grid grid-cols-1 gap-12 px-6",
            "sm:grid-cols-2 sm:gap-6 sm:pr-0",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-12 xl:grid-cols-4"
          )}
        >
          <P size="md" dotCSS="text-amber-300" shape="triangle">
            <Strong>Encryption at rest</Strong>
            <br />
            Stored data encrypted with&nbsp;AES-256.
          </P>
          <P size="md" dotCSS="text-red-400" shape="rectangle">
            <Strong>Encryption in transit</Strong>
            <br />
            Encrypted with TLS 1.2 or&nbsp;greater.
          </P>
          <P size="md" dotCSS="text-sky-400" shape="circle">
            <Strong>Data segregation</Strong>
            <br />
            By workspace and&nbsp;companies; Services are&nbsp;isolated.
          </P>
          <P size="md" dotCSS="text-emerald-400" shape="hexagon">
            <Strong>No training</Strong>
            <br />
            Customer prompts or&nbsp;data are not&nbsp;used for
            training&nbsp;models.
          </P>
        </div>
      </Grid>
      <Grid>
        <div
          className={classNames(
            "col-span-12 grid grid-cols-1 gap-8",
            "sm:grid-cols-2",
            "lg:col-span-10 lg:col-start-2",
            "2xl:col-span-8 2xl:col-start-3"
          )}
        >
          <ImgBlock
            title={<>Full granularity in data&nbsp;selection.</>}
            content={
              <>
                For each Data&nbsp;Source, granularlly select what&nbsp;you want
                shared with&nbsp;Dust.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
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
          </ImgBlock>
          <ImgBlock
            title={<>Manage workspace invitations&nbsp;seamlessly.</>}
            content={
              <>
                Control your workspace with Single Sign-On (SSO) and easy
                batch&nbsp;invites.
              </>
            }
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className={classNames("relative")}
            >
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
          </ImgBlock>
        </div>
      </Grid>
    </>
  );
}

Security.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
