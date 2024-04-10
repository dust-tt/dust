import type { ReactElement } from "react";
import React from "react";

import {
  Grid,
  H2,
  P,
  Strong,
} from "@app/components/home/new/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/new/LandingLayout";
import LandingLayout from "@app/components/home/new/LandingLayout";
import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

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
    props: { gaTrackingId: config.getGaTrackingId(), shape: 1 },
  };
});

export default function Security() {
  return (
    <>
      <Grid>
        <H2
          className="col-span-8 col-start-2"
          from="from-sky-300"
          to="to-sky-500"
        >
          Designed for security
          <br />
          and data privacy.
        </H2>
        <P size="lg" className="col-span-5 col-start-2">
          <Strong>Your data is private</Strong>, No re-training of&nbsp;models
          on your internal knowledge.
        </P>
        <P size="lg" className="col-span-5">
          <Strong>Enterprise-grade security</Strong> to manage your&nbsp;data
          access policies with control and&nbsp;confidence.
        </P>
      </Grid>
    </>
  );
}

Security.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
