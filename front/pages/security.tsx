import type { ReactElement } from "react";
import React from "react";

import { HeaderContentBlock } from "@app/components/home/new/ContentBlocks";
import {
  A,
  Grid,
  H3,
  H5,
  P,
  Strong,
} from "@app/components/home/new/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/new/LandingLayout";
import LandingLayout from "@app/components/home/new/LandingLayout";
import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  gaTrackingId: string;
  shape: number;
}>(async (context) => {
  // Fetch session explicitly as this page redirects logged in users to our home page.
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (user && user.workspaces.length > 0) {
    let url = `/w/${user.workspaces[0].sId}`;

    if (context.query.inviteToken) {
      url = `/api/login?inviteToken=${context.query.inviteToken}`;
    }

    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  }

  return {
    props: { gaTrackingId: config.getGaTrackingId(), shape: 10 },
  };
});

export default function Security() {
  return (
    <>
      <HeaderContentBlock
        title={
          <>
            For enterprise&nbsp;AI,
            <br />
            security is&nbsp;non-negotiable
          </>
        }
        from="from-green-200"
        to="to-emerald-400"
        subtitle={
          <>
            We've made security our core focus from day&nbsp;one,
            <br />
            building stringent processes and infrastructure to safeguard
            your&nbsp;company&nbsp;data and workspace&nbsp;privacy.
          </>
        }
      />
      <Grid gap="gap-8">
        <div
          className={classNames(
            "col-span-12",
            "grid grid-cols-1 gap-12",
            "md:grid-cols-2 md:gap-6",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-3"
          )}
        >
          <P size="md" dotCSS="text-amber-300" shape="triangle">
            <Strong>Encryption at rest</Strong>
            <br />
            Encrypted with&nbsp;AES-256.
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
      <Grid gap="gap-8">
        <H3 className="col-span-12 text-center text-white">
          Certifications
          <br />
          and Trust Center
        </H3>

        <div className="col-span-12 flex flex-col gap-2 text-center text-white md:col-span-4">
          <div className="flex aspect-[16/9] w-full items-center justify-center">
            <img
              src="/static/landing/security/soc2.svg"
              className="object-contain"
            />
          </div>
          <H5>Soc2 Type II Certified</H5>
          <P>
            The most comprehensive certification that Dust is designed to keep
            our customers data secure.
          </P>
        </div>
        <div className="col-span-12 flex flex-col gap-2 text-center text-white md:col-span-4">
          <div className="flex aspect-[16/9] w-full items-center justify-center">
            <img
              src="/static/landing/security/gdpr.svg"
              className="object-contain"
            />
          </div>
          <H5>GDPR Compliant</H5>
          <P>
            Dust secure customers’ personal information in accordance with the
            EU’s General Data Protection Regulation (GDPR)
          </P>
        </div>
        <div className="col-span-12 flex flex-col gap-2 text-center text-white md:col-span-4">
          <div className="flex aspect-[16/9] w-full items-center justify-center">
            <img
              src="/static/landing/security/vanta.svg"
              className="object-contain"
            />
          </div>
          <H5>Trust Center</H5>
          <P>
            Learn more about security at Dust in our Vanta{" "}
            <A
              href="https://app.vanta.com/dust.tt/trust/f3ytzxpay31bwsiyuqjto"
              target="_blank"
            >
              Trust Center
            </A>
          </P>
        </div>
      </Grid>
    </>
  );
}

Security.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
